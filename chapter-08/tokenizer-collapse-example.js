import tokenize from './tokenizer-collapse.js'

const test = 'ab*'
const result = tokenize(test)
console.log(JSON.stringify(result, null, 2))
