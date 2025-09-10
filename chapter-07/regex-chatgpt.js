import RegexBase from './regex-base.js'

class RegexAny extends RegexBase {
  constructor(child, rest) {
    super(rest)
    this.child = child
    this._resMemo = new Map()        // start -> result
    this._restAtPosMemo = new Map()  // pos   -> result  (★추가)
  }

  _match(text, start) {
    if (this._resMemo.has(start)) return this._resMemo.get(start)

    // 1) closure를 지역에서 한 번 계산
    const ends = this._closure(text, start)   // [start, ...reachable ends]

    // 2) 그리디 순서로 rest 시도 (pos 내림차순)
    let result = undefined
    for (let i = ends.length - 1; i >= 0; i -= 1) {
      const pos = ends[i]
      let after
      if (this.rest) {
        if (this._restAtPosMemo.has(pos)) {
          after = this._restAtPosMemo.get(pos)
        } else {
          after = this.rest._match(text, pos)
          this._restAtPosMemo.set(pos, after)
        }
      } else {
        after = pos
      }
      if (after !== undefined) { result = after; break }
    }

    this._resMemo.set(start, result)
    return result
  }

  _closure(text, start) {
    const ends = [start]; const seen = new Set([start])
    let frontier = [start]
    while (frontier.length) {
      const next = []
      for (const pos of frontier) {
        const one = this.child._match(text, pos)
        if (one !== undefined && !seen.has(one)) {
          seen.add(one); ends.push(one); next.push(one)
        }
      }
      frontier = next
    }
    return ends
  }
}

export default (child, rest = null) => new RegexAny(child, rest)
