// ChatGPT가 작성한 코드 (수정본)
//
// 04-join-performance.js
// Q2/Q3 통합 조인 성능 실험 (숫자 키 버전).
// - join 구현은 ./04-join.js 에서 import (필드: key/left/right).
// - 출력: CSV (헤더 1줄 + 시나리오별 1줄)
//   scenario,nL,nR,K,matchRate,oneToOne,n_out,t_naive_ms,t_indexed_ms,speedup(indexed/naive)
//
// 실행 팁:
//   SEED=12345 W=30 I=7 ORDER=fixed GC_PER_ITER_BEFORE=1 \
//   node --expose-gc 04-join-performance.js > out.csv
//
// 필터링:
//   ONLY="Q2:"                              // Q2만
//   ONLY="Q2:tinyL"                         // tinyL 케이스만
//   ONLY="Q3:K-sweep"                       // K 스윕만
//   ONLY="Q3:match-sweep"                   // 기본 match 스윕만
//   ONLY="Q3:match-sweep(tinyL"             // tinyL match 스윕만
//
// 환경변수(선택):
//   SEED=12345                  // PRNG 시드
//   W=30 I=7                    // 워밍업/반복 횟수
//   SKIP_NAIVE=0|1              // 큰 케이스에서 naive 측정 생략
//   GC_PER_ITER_BEFORE=1        // 반복 시작 직전 GC (node --expose-gc 필요)
//   GC_PER_ITER_AFTER=0|1       // 반복 종료 후 GC (보통 0 권장)
//   ORDER=fixed|shuffle         // 시나리오 실행 순서
//   ONLY="A,B"                  // 포함 키워드(쉼표 분리) 중 하나라도 매칭되면 실행
//
//   Q2_N=10000                  // Q2 일반 비교 nL=nR
//   Q3_N=2000                   // Q3 스윕 기본 nL=nR
//   Q3_K_LIST="1,2,3,4,6,8,12,16,32,64,256,1024,2000"
//   Q3_MATCH_RATES="0,0.1,0.2,0.3,0.5,0.7,0.9,1.0"
//   Q3_MATCH_K=1
//
//   // 🔹 index가 느려지는 케이스를 Q2/Q3에 자연스럽게 섞기 위한 파라미터
//   // Q2: tiny left vs big right (no-match / sparse 1:1)
//   Q2_TINY_L=8
//   Q2_TINY_R=200000
//   Q2_TINY_K_NO_MATCH=4096      // no-match: right 0..K-1 vs left K..2K-1
//   // sparse 1:1: K = nR 로 맞춰 each-right-distinct → left는 일부만 매치
//
//   // Q3: tinyL vs bigR match-rate sweep (교차/역전 유도)
//   Q3_TINY_NL=8
//   Q3_TINY_NR=200000
//   Q3_TINY_K=16
//   Q3_TINY_MATCH_RATES="0,0.1,0.3,0.5,0.7,0.9,1.0"

import { joinNaive, joinIndex } from "./04-join.js";

// ========== 0) 유틸 ==========
function nowNs() { return process.hrtime.bigint(); }
function nsToMs(ns) { return Number(ns) / 1e6; }
function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function makeRng(seed = 0xDEADBEEF >>> 0) {
  let x = seed >>> 0;
  return function rand() {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 2 ** 32;
  };
}
function parseNumList(env, fallback) {
  return (process.env[env] ?? fallback)
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
}
function parseOnlyList() {
  const raw = (process.env.ONLY ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// ========== 1) 환경 변수 ==========
const SEED       = Number(process.env.SEED ?? 12345);
const W          = Number(process.env.W ?? 30);
const I          = Number(process.env.I ?? 7);
const SKIP_NAIVE = process.env.SKIP_NAIVE === "1";
const ORDER      = (process.env.ORDER ?? "fixed"); // "fixed" | "shuffle"
const ONLY_LIST  = parseOnlyList();

const Q2_N       = Number(process.env.Q2_N ?? 10000);
const Q3_N       = Number(process.env.Q3_N ?? 2000);
const Q3_K_LIST  = parseNumList("Q3_K_LIST", "1,2,3,4,6,8,12,16,32,64,256,1024,2000");
const Q3_MATCH_RATES = parseNumList("Q3_MATCH_RATES", "0,0.1,0.2,0.3,0.5,0.7,0.9,1.0");
const Q3_MATCH_K  = Number(process.env.Q3_MATCH_K ?? 1);

// Q2 tiny L vs big R
const Q2_TINY_L = Number(process.env.Q2_TINY_L ?? 8);
const Q2_TINY_R = Number(process.env.Q2_TINY_R ?? 200000);
const Q2_TINY_K_NO_MATCH = Number(process.env.Q2_TINY_K_NO_MATCH ?? 4096);

// Q3 tinyL match sweep
const Q3_TINY_NL = Number(process.env.Q3_TINY_NL ?? 8);
const Q3_TINY_NR = Number(process.env.Q3_TINY_NR ?? 200000);
const Q3_TINY_K  = Number(process.env.Q3_TINY_K ?? 16);
const Q3_TINY_MATCH_RATES = parseNumList("Q3_TINY_MATCH_RATES", "0,0.1,0.3,0.5,0.7,0.9,1.0");

// GC flags
const GC_PER_ITER_BEFORE = process.env.GC_PER_ITER_BEFORE === '1';
const GC_PER_ITER_AFTER  = process.env.GC_PER_ITER_AFTER === '1';

// ========== 2) 데이터 생성기 (숫자 키, 균질·재현성) ==========
// - right: K개 키(0..K-1)에 균등 분배
// - left: oneToOneTight=true면 match 부분을 라운드로빈 균등 분배
//         false면 시드 PRNG로 균등샘플링
// - 비매칭 키는 충돌 없도록 K..(2K-1) 범위 사용
function makeDatasets({
  nL, nR, K, matchRate = 1.0, seed = SEED, oneToOneTight = true
}) {
  const rng = makeRng(seed);

  // right
  const right = [];
  for (let i = 0; i < nR; i++) {
    const k = i % K; // 0..K-1
    right.push({ key: k, right: `R${k}_${i}` });
  }

  // left
  const left = [];
  const K_noise = Math.max(1, K);

  if (oneToOneTight) {
    const nL_match = Math.floor(nL * matchRate);
    const nL_nomatch = nL - nL_match;
    for (let i = 0; i < nL_match; i++) {
      const k = i % K;            // 0..K-1
      left.push({ key: k, left: `L${i}` });
    }
    for (let i = 0; i < nL_nomatch; i++) {
      const kk = i % K_noise;     // 0..K-1
      left.push({ key: K + kk, left: `Lz${i}` }); // K..2K-1
    }
  } else {
    for (let i = 0; i < nL; i++) {
      const match = (rng() < matchRate);
      if (match) {
        const k = Math.floor(rng() * K);      // 0..K-1
        left.push({ key: k, left: `L${i}` });
      } else {
        const kk = Math.floor(rng() * K_noise);
        left.push({ key: K + kk, left: `Lz${i}` }); // K..2K-1
      }
    }
  }

  return { left, right };
}

// ========== 3) 벤치 ==========
function benchOne(fn, args) {
  // 워밍업 (타이머 밖)
  for (let i = 0; i < W; i++) fn(...args);

  const times = [];
  for (let i = 0; i < I; i++) {
    if (GC_PER_ITER_BEFORE && global.gc) global.gc();
    const t0 = nowNs();
    const out = fn(...args);
    const t1 = nowNs();
    if (GC_PER_ITER_AFTER && global.gc) global.gc();

    if (!out || typeof out.length !== 'number')
      throw new Error('join must return array');
    times.push(nsToMs(t1 - t0));
  }
  return median(times);
}

// 빠른 n_out 계산(인덱스로만 카운트)
function countOutFast(left, right) {
  const idx = new Map();
  for (let r = 0; r < right.length; r++) {
    const k = right[r].key;
    let b = idx.get(k);
    if (!b) { b = []; idx.set(k, b); }
    b.push(r);
  }
  let count = 0;
  for (let l = 0; l < left.length; l++) {
    const bucket = idx.get(left[l].key);
    if (bucket) count += bucket.length;
  }
  return count;
}

// ========== 4) 시나리오 정의 (Q2/Q3 일원화) ==========
function makeScenarios() {
  const scenarios = [];

  // ---- Q2: 대표 비교 ----
  scenarios.push(["Q2:no-match_smallK",   { nL:Q2_N, nR:Q2_N, K:128,   matchRate:0.0, oneToOneTight:true }]);
  scenarios.push(["Q2:one-to-one",        { nL:Q2_N, nR:Q2_N, K:Q2_N,  matchRate:1.0, oneToOneTight:true }]);
  scenarios.push(["Q2:one-to-many(n=5)",  { nL:Q2_N, nR:Q2_N, K:2000,  matchRate:1.0, oneToOneTight:false }]);
  scenarios.push(["Q2:many-to-many",      { nL:Q2_N, nR:Q2_N, K:1000,  matchRate:0.8, oneToOneTight:false }]);
  scenarios.push(["Q2:all-same-key",      { nL:4000, nR:4000, K:1,     matchRate:1.0, oneToOneTight:false }]);

  // ---- Q2: index가 느려지는 케이스(자연스럽게 포함) ----
  // 1) tiny left vs big right, no-match → index는 Map 구축 O(nR)만 내고 끝, naive는 O(nL*nR)이나 nL가 매우 작아 유리
  scenarios.push(["Q2:tinyL_noMatch", {
    nL: Q2_TINY_L, nR: Q2_TINY_R, K: Q2_TINY_K_NO_MATCH, matchRate: 0.0, oneToOneTight: true
  }]);
  // 2) tiny left vs big right, sparse 1:1 (각 right 키 고유) → n_out ≈ nL
  scenarios.push(["Q2:tinyL_sparse_1to1", {
    nL: Q2_TINY_L, nR: Q2_TINY_R, K: Q2_TINY_R, matchRate: 1.0, oneToOneTight: true
  }]);

  // ---- Q3: K-sweep (교차 관찰) ----
  for (const K of Q3_K_LIST) {
    scenarios.push([`Q3:K-sweep[K=${K}]`, { nL:Q3_N, nR:Q3_N, K, matchRate:1.0, oneToOneTight:false }]);
  }

  // ---- Q3: match-rate sweep (기본 스윕, nL=nR=Q3_N, K=Q3_MATCH_K) ----
  for (const m of Q3_MATCH_RATES) {
    scenarios.push([`Q3:match-sweep[${m}]`, { nL:Q3_N, nR:Q3_N, K:Q3_MATCH_K, matchRate:m, oneToOneTight:false }]);
  }

  // ---- Q3: match-rate sweep (tinyL vs bigR → 낮은 p에서 index 느리게, 높은 p에서 역전) ----
  for (const m of Q3_TINY_MATCH_RATES) {
    scenarios.push([`Q3:match-sweep(tinyL,K=${Q3_TINY_K})[${m}]`, {
      nL: Q3_TINY_NL, nR: Q3_TINY_NR, K: Q3_TINY_K, matchRate: m, oneToOneTight: false
    }]);
  }

  // 실행 순서
  if (ORDER === "shuffle") {
    const rng = makeRng(SEED ^ 0xabcdef);
    for (let i = scenarios.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [scenarios[i], scenarios[j]] = [scenarios[j], scenarios[i]];
    }
  }
  return scenarios;
}

// ========== 5) 실행 ==========
function shouldRun(name) {
  if (ONLY_LIST.length === 0) return true;
  return ONLY_LIST.some(tok => name.includes(tok));
}

function runScenario(name, params) {
  const { left, right } = makeDatasets(params);
  const n_out = countOutFast(left, right); // 빠른 카운트

  const tIndexed = benchOne(joinIndex, [left, right]);
  const tNaive   = SKIP_NAIVE ? NaN : benchOne(joinNaive, [left, right]);
  const ratio    = SKIP_NAIVE ? "" : (tIndexed / tNaive).toFixed(3);

  console.log([
    name,
    params.nL, params.nR, params.K,
    params.matchRate, params.oneToOneTight ? 1 : 0,
    n_out,
    isNaN(tNaive) ? "" : tNaive.toFixed(3),
    tIndexed.toFixed(3),
    ratio
  ].join(","));
}

function main() {
  console.log([
    "scenario","nL","nR","K","matchRate","oneToOne",
    "n_out","t_naive_ms","t_indexed_ms","speedup(indexed/naive)"
  ].join(","));

  const scenarios = makeScenarios();
  for (const [name, params] of scenarios) {
    if (!shouldRun(name)) continue;
    runScenario(name, params);
  }
}

// Node ESM에서 import.meta.main 사용
if (import.meta.main) {
  main();
}

