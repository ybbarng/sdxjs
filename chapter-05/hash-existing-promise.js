// [main]
import fs from 'fs/promises'             // fs-extra-promise 대신 표준 promises API 사용
import { glob } from 'glob'              // glob v11: 구조분해 할당
import crypto from 'crypto'

const hashExisting = async (rootDir) => {
  const pattern = `${rootDir}/**/*`
  const matches = await glob(pattern, {})          // glob 자체가 Promise 지원

  const stats = await Promise.all(matches.map(path => statPath(path)))
  const files = stats.filter(([_, stat]) => stat.isFile())

  const contents = await Promise.all(files.map(([path, _]) => readPath(path)))
  const hashes = contents.map(([path, content]) => hashPath(path, content))

  return hashes
}
// [/main]

// [helpers]
const statPath = async (path) => {
  const stat = await fs.stat(path)
  return [path, stat]
}

const readPath = async (path) => {
  const content = await fs.readFile(path, 'utf-8')
  return [path, content]
}
// [/helpers]

// [hashPath]
const hashPath = (path, content) => {
  const hasher = crypto.createHash('sha1').setEncoding('hex')
  hasher.write(content)
  hasher.end()
  return [path, hasher.read()]
}
// [/hashPath]

export default hashExisting

