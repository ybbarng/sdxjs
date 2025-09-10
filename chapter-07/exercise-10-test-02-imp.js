// Usage:
//   node regex-m-sweep.js
//
// 설명:
// - "/a*...a*b/" (a*가 m개) vs "a".repeat(N) (불일치) 시나리오를 측정
// - 네가 가진 구현(Alt/Any/End/Lit/Start)을 그대로 사용하고,
//   _match를 동적으로 감싸서 호출 수를 집계(counter.js 사용)
// - 결과는 CSV로 저장 + 콘솔 로그

import { performance } from 'node:perf_hooks'
import fs from 'node:fs'
import path from 'node:path'
import Alt from './regex-alt.js'
import Any from './regex-any.js'
import End from './regex-end.js'
import Lit from './regex-lit.js'
import Start from './regex-start.js'
import { resetCounters, counters, count } from './counter.js'

// --------------------------- CLI 옵션 ---------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)

const ns = [10]
const ms = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 320, 384, 512, 640, 768, 1024, 1280, 1536, 2048, 2560, 3072, 4096]

// --------------------- 계측(_match 래핑) -----------------------
const instrument = (matcher) => {
  const seen = new WeakSet()

  const guessType = (m) => {
    if (!m || typeof m !== 'object') return 'Unknown'
    if ('left' in m && 'right' in m) return 'Alt'
    if ('child' in m) return 'Any'
    if ('chars' in m) return 'Lit'
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

    if (typeof m._match === 'function' && !m._match.__wrapped) {
      const orig = m._match.bind(m)
      const wrapped = (text, start) => {
        count(typeName)
        return orig(text, start)
      }
      wrapped.__wrapped = true
      m._match = wrapped
    }

    if ('rest' in m) wrap(m.rest)
    if ('child' in m) wrap(m.child)
    if ('left' in m) wrap(m.left)
    if ('right' in m) wrap(m.right)
  }

  wrap(matcher)
  return matcher
}

// --------------------- 패턴/텍스트 빌더 -----------------------
const makeA = (n) => 'a'.repeat(n)

// /a*...a*b/ (a*가 m개)
const buildAStarChain = (m) => {
  const litA = Lit('a')
  const litB = Lit('b')
  let cur = litB
  for (let i = 0; i < m; i += 1) {
    cur = Any(litA, cur)
  }
  return cur
}

// ------------------------ 실행 유틸 ----------------------------
const time = async (fn) => {
  const t0 = performance.now()
  const r = await fn()
  const t1 = performance.now()
  return { r, ms: (t1 - t0) }
}

const fmtByType = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(', ')

const runOnce = async ({ N, m }) => {
  const text = makeA(N)
  const matcher = buildAStarChain(m)
  resetCounters()
  instrument(matcher)
  const { r, ms } = await time(() => Promise.resolve(matcher.match(text)))
  const ok = (r === false) // "a"^N vs /a*...a*b/ -> 불일치가 기대값
  const label = ok ? 'pass' : 'fail'
  return {
    N, m, ok, ms: +ms.toFixed(4),
    total: counters.total,
    Any: counters.byType.Any || 0,
    Lit: counters.byType.Lit || 0,
    Start: counters.byType.Start || 0,
    End: counters.byType.End || 0,
    Alt: counters.byType.Alt || 0,
    note: label
  }
}

// ------------------------ 메인 루프 ----------------------------
const main = async () => {
  const rows = []
  console.log(`Scenario: "/a*...a*b/" X "a".repeat(N) -> false`)
  console.log(`Ns=[${ns}], m=[${ms.join(', ')}]`)
  for (const N of ns) {
    for (const m of ms) {
      const row = await runOnce({ N, m })
      rows.push(row)
      console.log(
        `(N=${row.N}, m=${row.m}) | ${row.note} | ${row.ms.toFixed(2)} ms | total=${row.total} | byType={ Any:${row.Any}, Lit:${row.Lit} }`
      )
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

