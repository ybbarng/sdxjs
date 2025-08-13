// ChatGPT가 작성한 코드 (수정본)
//
// benchmark-join.js
// Q2/Q3 통합 실험 (sweep + crossover).
// Node (ESM). join 구현은 ./04-join.js 에서 import.
// 필드명: key/left/right
//
// 출력: CSV (헤더 1줄 + 시나리오별 1줄)
//   scenario,nL,nR,K,matchRate,oneToOne,n_out,t_naive_ms,t_indexed_ms,speedup(indexed/naive)
//
// 환경변수(필요 시):
//   SEED=12345             // PRNG 시드(재현성)
//   W=30 I=7               // 워밍업/반복 횟수
//   SKIP_NAIVE=1           // 큰 케이스에서 naive 시간 측정 생략
//   GC_PER_ITER_BEFORE=1   // 각 반복 시작 직전에 global.gc() 호출(노이즈 감소; node --expose-gc 필요)
//   GC_PER_ITER_AFTER=1    // 각 반복 종료 후 GC (보통 비권장; 기본 미사용)
//   ORDER=shuffle          // 실행 순서를 랜덤 섞기 (기본은 정의된 순서)
//   ONLY="Q2:"             // 특정 prefix 포함 케이스만 실행 (예: "Q3:K-sweep", "Q3:match-sweep")
//
//   Q2_N=10000             // Q2 비교 실험 nL=nR
//   Q3_N=2000              // Q3 스윕 실험 nL=nR (작게 잡아 교차 관찰 용이)
//   Q3_K_LIST=1,2,3,4,6,8,12,16,32,64,256,1024,2000    // K 스윕 값들 (교차 보장 범위)
//   Q3_MATCH_RATES=0,0.1,0.2,0.3,0.5,0.7,0.9,1.0       // matchRate 스윕 (교차 보장 범위)
//   Q3_MATCH_K=1           // matchRate 스윕에서 사용할 K (작을수록 n_out↑ → 교차 가능성↑)

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
function parseList(env, fallback) {
  return (process.env[env] ?? fallback).split(",").map(s => s.trim()).filter(Boolean).map(Number);
}

// ========== 1) 환경 변수 (변인 통제) ==========
const SEED       = Number(process.env.SEED ?? 12345);
const W          = Number(process.env.W ?? 30);
const I          = Number(process.env.I ?? 7);
const SKIP_NAIVE = process.env.SKIP_NAIVE === "1";
const ORDER      = (process.env.ORDER ?? "fixed"); // "fixed" | "shuffle"
const ONLY       = process.env.ONLY ?? "";

// 교차 유도를 위한 기본 파라미터
const Q2_N       = Number(process.env.Q2_N ?? 10000);
const Q3_N       = Number(process.env.Q3_N ?? 2000);
const Q3_K_LIST  = parseList("Q3_K_LIST", "1,2,3,4,6,8,12,16,32,64,256,1024,2000");
const Q3_MATCH_RATES = parseList("Q3_MATCH_RATES", "0,0.1,0.2,0.3,0.5,0.7,0.9,1.0");
const Q3_MATCH_K  = Number(process.env.Q3_MATCH_K ?? 1);

// ========== 2) 데이터 생성기 (균질·재현성) ==========
// - right: K개 키에 균등 분배 (i%K)
// - left: oneToOneTight=true면 match 부분은 키를 라운드로빈 균등 분배 (난수 영향 최소화)
//         false면 시드 PRNG로 균등샘플링 (재현성)
function makeDatasets({
  nL, nR, K, matchRate = 1.0, seed = SEED, oneToOneTight = true
}) {
  const rng = makeRng(seed);

  // right: 균등
  const right = [];
  for (let i = 0; i < nR; i++) {
    const k = i % K;
    right.push({ key: `K${k}`, right: `R${k}_${i}` });
  }

  // left
  const left = [];
  if (oneToOneTight) {
    const nL_match = Math.floor(nL * matchRate);
    const nL_nomatch = nL - nL_match;
    // 매칭: 라운드로빈으로 K개 키에 균등 분배 (분산 최소화)
    for (let i = 0; i < nL_match; i++) {
      const k = i % K;
      left.push({ key: `K${k}`, left: `L${i}` });
    }
    // 비매칭: Z-영역(매칭 불가)로 균일 채움
    for (let i = 0; i < nL_nomatch; i++) {
      const kk = i % K;
      left.push({ key: `Z${kk}`, left: `Lz${i}` });
    }
  } else {
    for (let i = 0; i < nL; i++) {
      const match = (rng() < matchRate);
      if (match) {
        const k = Math.floor(rng() * K);
        left.push({ key: `K${k}`, left: `L${i}` });
      } else {
        const kk = Math.floor(rng() * K);
        left.push({ key: `Z${kk}`, left: `Lz${i}` });
      }
    }
  }

  return { left, right };
}

// ========== 3) 보조 함수 ==========
const GC_PER_ITER_BEFORE = process.env.GC_PER_ITER_BEFORE === '1';
const GC_PER_ITER_AFTER  = process.env.GC_PER_ITER_AFTER === '1'; // 보통은 꺼둠

function benchOne(fn, args) {
  // 워밍업 (타이머 밖)
  for (let i = 0; i < W; i++) fn(...args);

  const times = [];
  for (let i = 0; i < I; i++) {
    // 반복마다, 측정 시작 전에만 GC (타이머 밖)
    if (GC_PER_ITER_BEFORE && global.gc) global.gc();

    const t0 = nowNs();
    const out = fn(...args);
    const t1 = nowNs();

    // (선택) 반복 끝난 뒤 GC — 보통은 불필요
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
  for (let i = 0; i < right.length; i++) {
    const k = right[i].key;
    let b = idx.get(k);
    if (!b) { b = []; idx.set(k, b); }
    b.push(right[i]);
  }
  let count = 0;
  for (let i = 0; i < left.length; i++) {
    const bucket = idx.get(left[i].key);
    if (bucket) count += bucket.length;
  }
  return count;
}

// ========== 4) 시나리오 정의 (Q2/Q3 일원화) ==========
// Q2: 기준 비교 (nL=nR=Q2_N)
// Q3-K: K 증가 스윕 (nL=nR=Q3_N, matchRate=1.0, oneToOneTight=false) → 작은 K에서 교차 기대
// Q3-M: matchRate 증가 스윕 (nL=nR=Q3_N, K=Q3_MATCH_K, oneToOneTight=false) → 높은 matchRate에서 교차 기대
function makeScenarios() {
  const scenarios = [];

  // Q2 (교차 포함 사례)
  scenarios.push(["Q2:no-match_smallK",   { nL:Q2_N, nR:Q2_N, K:128,   matchRate:0.0, oneToOneTight:true }]);
  scenarios.push(["Q2:one-to-one",        { nL:Q2_N, nR:Q2_N, K:Q2_N,  matchRate:1.0, oneToOneTight:true }]);
  scenarios.push(["Q2:one-to-many(n=5)",  { nL:Q2_N, nR:Q2_N, K:2000,  matchRate:1.0, oneToOneTight:false }]);
  scenarios.push(["Q2:many-to-many",      { nL:Q2_N, nR:Q2_N, K:1000,  matchRate:0.8, oneToOneTight:false }]);
  // 교차 유도: 스케일 살짝↑
  scenarios.push(["Q2:all-same-key",      { nL:4000, nR:4000, K:1,     matchRate:1.0, oneToOneTight:false }]);

  // Q3 - K sweep (교차 포함: oneToOneTight=false)
  for (const K of Q3_K_LIST) {
    scenarios.push([`Q3:K-sweep[K=${K}]`, { nL:Q3_N, nR:Q3_N, K, matchRate:1.0, oneToOneTight:false }]);
  }

  // Q3 - matchRate sweep (교차 포함: K=Q3_MATCH_K=1, oneToOneTight=false)
  for (const m of Q3_MATCH_RATES) {
    scenarios.push([`Q3:match-sweep[${m}]`, { nL:Q3_N, nR:Q3_N, K:Q3_MATCH_K, matchRate:m, oneToOneTight:false }]);
  }

  // 실행 순서 제어
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
    if (ONLY && !name.includes(ONLY)) continue;
    runScenario(name, params);
  }
}

if (import.meta.main) {
  main();
}

