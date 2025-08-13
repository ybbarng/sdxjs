// ChatGPT가 작성한 코드
//
// Join 성능 테스트: 키 수(K), 매칭 비율(matchRate), 우측 다중도(mRightPerKey) 변수를 바꿔가며
// naive(이중 루프) vs indexed(Map) 조인의 시간을 측정한다.
// Node (ESM) / Deno 호환. Node >= 14 권장.

// =============================
// 0) 유틸: 타이밍/통계/검증
// =============================
function nowNs() { return process.hrtime.bigint(); }
function nsToMs(ns) { return Number(ns) / 1e6; }
function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// 간단 PRNG (xorshift32)
function makeRng(seed = 0xDEADBEEF >>> 0) {
  let x = seed >>> 0;
  return function rand() {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 2 ** 32;
  };
}

// =============================
// 1) 조인 구현 (row-major)
// =============================
// 직접 구현한 코드 사용 (소문자 필드 사용 가정: key/left/right)
import { joinNaive, joinIndex } from "./04-join.js";

// =======================================
// 2) 데이터 생성기 (키/매치/다중도 제어)
// =======================================
/**
 * 파라미터
 * - nL: left 행 수
 * - nR: right 행 수
 * - K:  매칭 가능한 고유 키 개수 (키 공간은 0..K-1)
 * - matchRate: left에서 매칭 가능한 키를 가질 확률 (0..1)
 * - mRightPerKey: right에서 키당 중복(평균) 개수
 * - seed: 재현성 시드
 * - oneToOneTight: true면 1:1을 더 엄격히 근사(좌우 균등 분배)
 */
function makeDatasets({
  nL, nR, K,
  matchRate = 1.0,
  mRightPerKey = 1,
  seed = 0xC0FFEE,
  oneToOneTight = false,
}) {
  const rng = makeRng(seed);

  // --- 2.1 right 생성 ---
  // 우선 키마다 mRightPerKey번씩 생성 → nR을 초과/미달하면 보정
  const right = [];
  for (let k = 0; k < K; k++) {
    const reps = Math.max(1, Math.floor(mRightPerKey));
    for (let t = 0; t < reps; t++) {
      if (right.length >= nR) break;
      right.push({ key: `K${k}`, right: `R${k}_${t}` });
    }
    if (right.length >= nR) break;
  }
  // 부족하면 균등 분배로 채움
  while (right.length < nR) {
    const k = right.length % K;
    right.push({ key: `K${k}`, right: `R${k}_x${right.length}` });
  }
  // 초과했으면 잘라냄
  if (right.length > nR) right.length = nR;

  // --- 2.2 left 생성 ---
  const K_noise = Math.max(1, K);
  const left = [];
  if (oneToOneTight) {
    // 1:1 근사 — 매칭 부분을 K개 키로 라운드로빈 분배
    const nL_match = Math.floor(nL * matchRate);
    const nL_nomatch = nL - nL_match;
    for (let i = 0; i < nL_match; i++) {
      const k = i % K;
      left.push({ key: `K${k}`, left: `L${i}` });
    }
    for (let i = 0; i < nL_nomatch; i++) {
      const k = Math.floor(rng() * K_noise);
      left.push({ key: `Z${k}`, left: `Lz${i}` }); // Z-접두사: 매칭 불가
    }
  } else {
    // 확률적으로 매칭/비매칭 키 생성
    for (let i = 0; i < nL; i++) {
      const match = rng() < matchRate;
      if (match) {
        const k = Math.floor(rng() * K);
        left.push({ key: `K${k}`, left: `L${i}` });
      } else {
        const k = Math.floor(rng() * K_noise);
        left.push({ key: `Z${k}`, left: `Lz${i}` });
      }
    }
  }

  return { left, right };
}

// ===================================
// 3) 벤치마크 러너 (워밍업/중앙값)
// ===================================
const SKIP_NAIVE = process.env.SKIP_NAIVE === '1';
const W = Number(process.env.W ?? 30);
const I = Number(process.env.I ?? 7);

function benchOne(fn, args, { warmup = W, iters = I } = {}) {
  // 워밍업
  for (let i = 0; i < warmup; i++) fn(...args);
  // 본 측정
  const times = [];
  for (let i = 0; i < iters; i++) {
    const t0 = nowNs();
    const out = fn(...args);
    const t1 = nowNs();
    if (!out || typeof out.length !== 'number') throw new Error('join function must return array');
    times.push(nsToMs(t1 - t0));
  }
  return median(times);
}

function countOut(left, right) {
  // 정확성 검증: 두 구현의 n_out 일치 확인
  const A = joinNaive(left, right);
  const B = joinIndex(left, right);
  if (A.length !== B.length) {
    throw new Error(`n_out mismatch: naive=${A.length}, indexed=${B.length}`);
  }
  return A.length;
}

// ===================================
// 4) 시나리오 실행 및 CSV 출력
// ===================================
const ONLY = process.env.ONLY ?? ''; // 특정 시나리오만 돌리고 싶을 때 포함 문자열로 필터

function runSuite() {
  console.log([
    'scenario',
    'nL','nR','K',
    'matchRate','oneToOne',
    'n_out',
    't_naive_ms','t_indexed_ms',
    'speedup(indexed/naive)'
  ].join(','));

  // --- Q2: 인덱스 vs 이중 루프 비교 (기본 + 확장) ---
  const scenariosBase = [
    // [설명, nL, nR, K, matchRate, mRightPerKey, oneToOneTight]
    ['Q2:no-match_smallK', 10000, 10000, 128,   0.0, 1,  false],
    ['Q2:one-to-one',      10000, 10000, 10000, 1.0, 1,  true ],
    ['Q2:one-to-many(n=5)',10000, 10000, 2000,  1.0, 5,  false], // K 작게 → 키당 매칭 많아짐
    ['Q2:many-to-many',    10000, 10000, 1000,  0.8, 5,  false],
    ['Q2:all-same-key',     2000,  2000, 1,     1.0, 2000, false],
  ];

  // --- Q3: K 스윕 & matchRate 스윕 (nL=nR=10_000 고정) ---
  const K_VALUES = [64, 256, 1024, 4096, 10000];
  const MR_VALUES = [0.0, 0.1, 0.5, 0.9, 1.0];

  const scenariosSweep = [];
  // K 스윕 (matchRate 고정 = 1.0)
  for (const K of K_VALUES) {
    scenariosSweep.push([`Q3:K-sweep[K=${K}]`, 10000, 10000, K, 1.0, 1, false]);
  }
  // matchRate 스윕 (K 고정 = 2000)
  for (const m of MR_VALUES) {
    scenariosSweep.push([`Q3:match-sweep[${m}]`, 10000, 10000, 2000, m, 5, false]);
  }

  // 묶기
  const scenarios = [...scenariosBase, ...scenariosSweep];

  // 실행
  for (const [name, nL, nR, K, matchRate, mRightPerKey, oneToOneTight] of scenarios) {
    if (ONLY && !name.includes(ONLY)) continue;

    const { left, right } = makeDatasets({ nL, nR, K, matchRate, mRightPerKey, oneToOneTight, seed: 12345 });

    const n_out = countOut(left, right);

    const tNaive   = SKIP_NAIVE ? NaN : benchOne(joinNaive, [left, right], { warmup: W, iters: I });
    const tIndexed = benchOne(joinIndex,          [left, right], { warmup: W, iters: I });

    const ratio = SKIP_NAIVE ? '' : (tIndexed / tNaive).toFixed(3);

    console.log([
      name,
      nL, nR, K,
      matchRate, oneToOneTight ? 1 : 0,
      n_out,
      isNaN(tNaive) ? '' : tNaive.toFixed(3),
      tIndexed.toFixed(3),
      ratio
    ].join(','));
  }
}

// Node ESM/Deno 호환: 네가 쓰던 스타일 유지
if (import.meta.main) {
  runSuite();
}
