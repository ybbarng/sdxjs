// regex-stress-tests.js
// Usage: node regex-stress-tests.js
// - 이 파일은 "테스트 하네스"입니다. 매처 구현(Alt/Any/End/Lit/Start)은
//   책의 예제 구현 파일들을 import한다고 가정합니다.
// - 구현을 수정하지 않고, _match를 동적으로 감싸서 호출 수를 셉니다.

import { performance } from 'node:perf_hooks'
import Alt from './regex-alt.js'
import Any from './regex-any.js'
import End from './regex-end.js'
import Lit from './regex-lit.js'
import Start from './regex-start.js'
import { resetCounters, counters, count } from './counter.js'

// ------------------------------------------------------------
// 계측(Instrumentation): 구현 코드를 수정하지 않고 _match 호출 수 집계
// ------------------------------------------------------------

/**
 * 매처 인스턴스를 재귀적으로 순회하며 _match를 래핑한다.
 * - typeName은 constructor.name에 의존하지 않고 구조로 추정한다.
 * - child/rest/left/right 필드를 추적해 트리를 모두 감싼다.
 */
const instrument = (matcher) => {
  const seen = new WeakSet()

  const guessType = (m) => {
    if (!m || typeof m !== 'object') return 'Unknown'
    // 구조 기반 추론 (예제 구현을 전제로 함)
    if ('left' in m && 'right' in m) return 'Alt'
    if ('child' in m) return 'Any'
    if ('chars' in m) return 'Lit'
    // Start/End는 고유 필드가 거의 없어 rest만 있는 경우가 많음
    // constructor.name로 보정 (없다면 Unknown)
    const n = m.constructor?.name
    if (n === 'RegexStart') return 'Start'
    if (n === 'RegexEnd') return 'End'
    return n || 'Unknown'
  }

  const wrap = (m) => {
    if (!m || typeof m !== 'object') return
    if (seen.has(m)) return
    seen.add(m)

    const typeName = guessType(m)

    // _match가 존재하면 한 번만 래핑
    if (typeof m._match === 'function' && !m._match.__wrapped) {
      const orig = m._match.bind(m)
      const wrapped = (text, start) => {
        count(typeName)
        return orig(text, start)
      }
      wrapped.__wrapped = true
      m._match = wrapped
    }

    // 연결된 자식 노드들도 재귀적으로 감싸기
    if ('rest' in m) wrap(m.rest)
    if ('child' in m) wrap(m.child)
    if ('left' in m) wrap(m.left)
    if ('right' in m) wrap(m.right)
  }

  wrap(matcher)
  return matcher
}

// ------------------------------------------------------------
// 테스트 케이스 정의
// ------------------------------------------------------------

const makeA = (n) => 'a'.repeat(n)

const CASES = [
  // --- Sanity ---
  {
    name: 'sanity: "a*" X "" -> true',
    build: () => Any(Lit('a')),
    text: () => '',
    expected: true,
  },
  {
    name: 'sanity: "ab|cd" X "xaby" -> true',
    build: () => Alt(Lit('ab'), Lit('cd')),
    text: () => 'xaby',
    expected: true,
  },

  // --- Stress set 1: 단일 Any + 결말 실패 (O(N^2)급) ---
  {
    name: 'stress1: "/a*b/" X "a".repeat(N) -> false',
    build: () => Any(Lit('a'), Lit('b')),
    text: (N) => makeA(N),
    expected: false,
  },
  {
    name: 'stress1b: "/a*b/" X "a".repeat(N)+"c" -> false',
    build: () => Any(Lit('a'), Lit('b')),
    text: (N) => makeA(N) + 'c',
    expected: false,
  },

  // --- Stress set 2: 단일 Any + 막판 1글자 실패 (O(N^2)급) ---
  {
    name: 'stress2: "/a*ba/" X "a".repeat(N)+"b" -> false',
    build: () => Any(Lit('a'), Lit('b', Lit('a'))),
    text: (N) => makeA(N) + 'b',
    expected: false,
  },

  // --- Stress set 3: Any 연쇄 3개 + 결말 실패 (조합 폭발) ---
  {
    name: 'stress3: "/a*a*a*b/" X "a".repeat(N) -> false',
    build: () => Any(Lit('a'), Any(Lit('a'), Any(Lit('a'), Lit('b')))),
    text: (N) => makeA(N),
    expected: false,
  },
  {
    name: 'stress3b: "/a*a*a*b/" X "a".repeat(N)+"c" -> false',
    build: () => Any(Lit('a'), Any(Lit('a'), Any(Lit('a'), Lit('b')))),
    text: (N) => makeA(N) + 'c',
    expected: false,
  },

  // --- Stress set 4: Alt 안의 Any (분기×반복) ---
  {
    name: 'stress4: "/(a|aa)*b/" X "a".repeat(N) -> false',
    build: () => Any(Alt(Lit('a'), Lit('aa')), Lit('b')),
    text: (N) => makeA(N),
    expected: false,
  },

  // --- Stress set 5: 앵커가 있어도 내부 Any가 병목 ---
  {
    name: 'stress5: "/^a*b$/" X "a".repeat(N)+"c" -> false',
    build: () => Start(Any(Lit('a'), Lit('b', End()))),
    text: (N) => makeA(N) + 'c',
    expected: false,
  },

  // --- Stress set 6: 거의 맞는 본문 + 실패 꼬리 ---
  {
    name: 'stress6: "/a*bca/" X "a".repeat(N)+"bc" -> false',
    build: () => Any(Lit('a'), Lit('b', Lit('c', Lit('a')))),
    text: (N) => makeA(N) + 'bc',
    expected: false,
  },
]

// ------------------------------------------------------------
// 실행 유틸
// ------------------------------------------------------------

const time = async (fn) => {
  const t0 = performance.now()
  const r = await fn()
  const t1 = performance.now()
  return { r, ms: (t1 - t0).toFixed(2) }
}

const fmtByType = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(', ')

const runOnce = async (name, matcher, text, expected) => {
  resetCounters()
  instrument(matcher)
  const { r, ms } = await time(() => Promise.resolve(matcher.match(text)))
  const ok = (r === expected)
  const label = ok ? 'pass' : 'fail'
  console.log(
    `${name} | expected=${expected} actual=${r} | ${label} | ${ms} ms | _match total=${counters.total} | byType={ ${fmtByType(counters.byType)} }`
  )
}

const run = async () => {
  // 규모 조절: 먼저 작은 N으로 “정상 작동” 확인 → 이후 Stress로 성능 비교
  const smallNs = [0, 1, 2, 8]
  const stressNs = [10, 50, 100, 500, 1_000] // 환경에 따라 줄이세요(예: 1_000)

  console.log('=== Sanity & Small N ===')
  for (const c of CASES.slice(0, 2)) {
    const matcher = c.build()
    await runOnce(c.name, matcher, c.text(), c.expected)
  }
  for (const N of smallNs) {
    console.log(`\n-- N=${N} --`)
    for (const c of CASES.slice(2)) {
      const matcher = c.build()
      await runOnce(`${c.name} (N=${N})`, matcher, c.text(N), c.expected)
    }
  }

  console.log('\n=== Stress N ===')
  for (const N of stressNs) {
    console.log(`\n-- N=${N} --`)
    for (const c of CASES.slice(2)) {
      const matcher = c.build()
      await runOnce(`${c.name} (N=${N})`, matcher, c.text(N), c.expected)
    }
  }
}

run().catch(err => {
  console.error('Error while running tests:', err)
  process.exit(1)
})

