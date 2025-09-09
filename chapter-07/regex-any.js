import RegexBase from './regex-base.js'

class RegexAny extends RegexBase {
  constructor (child, rest) {
    super(rest)
    this.child = child
  }

  _match (text, start) {
    const maxPossible = text.length - start
    // n회 반복에 대한 cache 생성
    this.cache = this._buildCache(text, start, maxPossible)
    for (let num = maxPossible; num >= 0; num -= 1) {
      const afterMany = this._matchMany(text, start, num)
      if (afterMany !== undefined) {
        return afterMany
      }
    }
    return undefined
  }

  /**
   * start에서 시작할 때, 0부터 max회까지 반복한 결과에 대한 캐시를 생성하는 함수
   *
   * cache[i]: 주어진 text와 start에 대해 i회 반복했을 때의 결과
   */
  _buildCache (text, start, max) {
    const cache = [start]
    for (let i = 1; i <= max; i += 1) {
      start = this.child._match(text, start)
      cache[i] = start;
      if (start === undefined) {
        return cache
      }
    }
    return cache
  }

  _matchMany (text, start, num) {
    // for문을 돌지 않고 cache에서 바로 꺼낸다.
    start = this.cache[num]
    if (start === undefined) {
      return undefined;
    }
    if (this.rest !== null) {
      return this.rest._match(text, start)
    }
    return start
  }
}

export default (child, rest = null) => new RegexAny(child, rest)
