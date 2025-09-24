const SIMPLE = {
  '|': 'Alt',
  '(': 'GroupStart',
  ')': 'GroupEnd'
}

const tokenize = (text) => {
  const result = []
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (c in SIMPLE) {
      result.push({ kind: SIMPLE[c], loc: i })
    } else if ((c === '^') && (i === 0)) {
      result.push({ kind: 'Start', loc: i })
    } else if ((c === '$') && (i === (text.length - 1))) {
      result.push({ kind: 'End', loc: i })
    } else if (c === '*') {
      if (text[i + 1] === '?') {
        result.push({ kind: 'AnyLazy', loc: i });
        i += 1;
      } else {
        result.push({ kind: 'Any', loc: i });
      }
    } else {
      result.push({ kind: 'Lit', loc: i, value: c })
    }
  }

  return result
}

export default tokenize
