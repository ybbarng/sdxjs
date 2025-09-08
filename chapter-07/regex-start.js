import RegexBase from './regex-base.js'

class RegexStart extends RegexBase {
  constructor (chars) {
    super()
    this.chars = chars
  }

  _match (text, start) {
    return undefined // FIXME
  }
}

export default (chars) => new RegexStart(chars)
