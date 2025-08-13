// ChatGPT가 작성한 코드를 적당히 수정해서 작성함

// benchmark-join.js
// Join 성능 테스트: 키 수(K), 매칭 비율(matchRate), 우측 다중도(mRightPerKey) 변수를 바꿔가며
// naive(이중 루프) vs indexed(Map) 조인의 시간을 측정한다.
// Node >= 14 권장.

///////////////////////////////
// 0. 유틸: 타이밍/통계/검증 //
///////////////////////////////

function nowNs() {
  return process.hrtime.bigint();
}
function nsToMs(ns) {
  return Number(ns) / 1e6;
}
function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// 간단한 고정 시드 PRNG (xorshift32)
function makeRng(seed = 0xDEADBEEF >>> 0) {
  let x = seed >>> 0;
  return function rand() {
    // 0 <= rand() < 1
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 2 ** 32;
  }
}

///////////////////////////////
// 1. 조인 구현 (row-major)  //
///////////////////////////////

// 직접 구현한 코드 사용
import { joinNaive, joinIndex } from "./04-join.js";

/////////////////////////////////////////
// 2. 데이터 생성기 (키/매치 제어 가능) //
/////////////////////////////////////////

/**
 * 데이터 생성 파라미터
 * - nL: left 행 수
 * - nR: right 행 수
 * - K:  right(및 매칭 가능한 영역)의 고유 키 개수 (키 공간은 [0, K-1])
 * - matchRate: left 행 중 "매칭 가능한 키"를 갖는 비율 (0.0~1.0)
 * - mRightPerKey: right에서 키당 평균/고정 중복 수 (1 => 1:1에 가까움, n=>1:n)
 * - seed: 난수 초기값(재현성)
 * - oneToOneTight: true면 1:1을 더 엄격히 근사(좌우 분포를 균등화)
 *
 * 생성 원리:
 *  - right: 키 0..K-1을 균등 반복시켜 총 nR행 구성 (키당 약 mRightPerKey개)
 *  - left:
 *      * matchRate 확률로 [0..K-1]에서 키 선택(매칭 가능)
 *      * 1 - matchRate 확률로 [K..K + K_noise - 1]에서 키 선택(매칭 불가)
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
  // K * mRightPerKey ≈ nR 이 되도록 스케일 (균등 분배)
  const right = [];
  let rCount = 0;
  for (let k = 0; k < K; k++) {
    const reps = Math.max(1, Math.floor(nR / K)); // 균등 분배
    for (let t = 0; t < reps; t++) {
      if (rCount >= nR) break;
      right.push({ key: `K${k}`, night: `R${k}_${t}` });
      rCount++;
    }
    if (rCount >= nR) break;
  }
  // 모자라면 랜덤 키로 채움
  while (right.length < nR) {
    const k = Math.floor(rng() * K);
    right.push({ key: `K${k}`, right: `R${k}_x${right.length}` });
  }

  // --- 2.2 left 생성 ---
  // 매칭 불가 영역 키 개수: K_noise (K와 같은 크기 사용)
  const K_noise = Math.max(1, K);
  const left = [];
  if (oneToOneTight) {
    // 1:1 근사 — 가능한 한 고르게 분배
    // left의 매칭 부분: floor(nL * matchRate)개를 K개 키에 라운드로빈
    const nL_match = Math.floor(nL * matchRate);
    const nL_nomatch = nL - nL_match;
    for (let i = 0; i < nL_match; i++) {
      const k = i % K;
      left.push({ key: `K${k}`, left: `L${i}` });
    }
    // 비매칭은 노이즈 공간에서
    for (let i = 0; i < nL_nomatch; i++) {
      const k = Math.floor(rng() * K_noise);
      left.push({ key: `Z${k}`, left: `Lz${i}` }); // Z-접두사는 매칭 불가
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

///////////////////////////////////////
// 3. 벤치마크 러너 (워밍업/중앙값)   //
///////////////////////////////////////

function benchOne(fn, args, { warmup = 50, iters = 10 } = {}) {
  // 워밍업
  for (let i = 0; i < warmup; i++) fn(...args);
  // 본 측정
  const times = [];
  for (let i = 0; i < iters; i++) {
    const t0 = nowNs();
    const out = fn(...args);
    const t1 = nowNs();
    // 결과를 소비해 죽은 코드 제거 방지
    if (!out || typeof out.length !== 'number') throw new Error('join function must return array');
    times.push(nsToMs(t1 - t0));
  }
  return median(times);
}

function countOut(left, right) {
  // 정확성 검증용: 두 구현의 n_out은 같아야 한다
  const A = joinNaive(left, right);
  const B = joinIndex(left, right);
  if (A.length !== B.length) {
    throw new Error(`n_out mismatch: naive=${A.length}, indexed=${B.length}`);
  }
  return A.length;
}

///////////////////////////////////////
// 4. 시나리오 실행 및 CSV 출력       //
///////////////////////////////////////

function runSuite() {
  console.log([
    'scenario',
    'nL', 'nR', 'K',
    'matchRate', 'oneToOne',
    'n_out',
    't_naive_ms', 't_indexed_ms',
    'speedup(indexed/naive)'
  ].join(','));

  const scenarios = [
    // [설명, nL, nR, K, matchRate, mRightPerKey, oneToOneTight]
    ['no-match_smallK', 10000, 10000, 128, 0.0, 1, false],
    ['one-to-one',      10000, 10000, 10000, 1.0, 1, true],
    ['one-to-many(n=5)',10000, 10000, 2000,  1.0, 5, false], // K 작게 → 키당 매칭 많아짐
    ['many-to-many',    10000, 10000, 1000,  0.8, 5, false],
    ['all-same-key',    2000,  2000,  1,     1.0, 2000, false],
    // 더 큰 스케일
    // 아래는 현실적으로 너무 오래 걸린다고 하므로 실행에서 제외함
    // ['big_no-match',    100000, 100000, 4096, 0.0, 1, false],
    // ['big_1to1',        100000, 100000, 100000,1.0, 1, true],
    // ['big_1toN(n=10)',  100000, 100000, 5000,  1.0, 10, false],
  ];

  for (const [name, nL, nR, K, matchRate, mRightPerKey, oneToOneTight] of scenarios) {
    const { left, right } = makeDatasets({ nL, nR, K, matchRate, mRightPerKey, oneToOneTight, seed: 12345 });

    // 정확성: 두 구현 결과 수가 같아야 함
    const n_out = countOut(left, right);

    // 타이밍
    const tNaive   = benchOne(joinNaive,   [left, right], { warmup: 30, iters: 7 });
    const tIndexed = benchOne(joinIndex, [left, right], { warmup: 30, iters: 7 });

    const speedup = tIndexed / tNaive;

    console.log([
      name,
      nL, nR, K,
      matchRate, oneToOneTight ? 1 : 0,
      n_out,
      tNaive.toFixed(3), tIndexed.toFixed(3),
      speedup.toFixed(3),
    ].join(','));
  }
}

if (import.meta.main) {
  runSuite();
}
