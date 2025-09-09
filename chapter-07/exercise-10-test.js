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
  // --- Stress set 1: 단일 Any + 결말 실패 (O(N^2)급) ---
  {
    name: 'Scenario: "/a*b/" X "a".repeat(N) -> false',
    build: () => Any(Lit('a'), Lit('b')),
    text: (N) => makeA(N),
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
    `${name} | ${label} | ${ms} ms | _match total=${counters.total} | byType={ ${fmtByType(counters.byType)} }`
  )
}

const run = async () => {
  // 2^n 테스트셋
  // const ns = [0, 1, 2, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]
  //
  // 부드러운 그래프용
  const ns = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 320, 384, 512, 640, 768, 1024, 1280, 1536, 2048, 2560, 3072, 4096]


  for (const c of CASES) {
    console.log(`${c.name}`);
    for (const N of ns) {
      const matcher = c.build()
      await runOnce(`(N=${N})`, matcher, c.text(N), c.expected)
    }
  }
}

run().catch(err => {
  console.error('Error while running tests:', err)
  process.exit(1)
})

