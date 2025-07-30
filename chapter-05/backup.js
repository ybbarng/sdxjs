import fs from 'fs/promises'

import hashExisting from './hash-existing-promise.js'
import findNew from './check-existing-files.js'

const backup = async (src, dst, timestamp = null) => {
  if (timestamp === null) {
    timestamp = Math.round((new Date()).getTime() / 1000)
  }
  timestamp = String(timestamp).padStart(10, '0')

  const existing = await hashExisting(src)
  const needToCopy = await findNew(dst, existing)
  await copyFiles(dst, needToCopy)
  await saveManifest(dst, timestamp, existing)
}

const copyFiles = async (dst, needToCopy) => {
  const promises = Object.keys(needToCopy).map(hash => {
    const srcPath = needToCopy[hash]
    const dstPath = `${dst}/${hash}.bck`
    return fs.copyFile(srcPath, dstPath)
  })
  return Promise.all(promises)
}

const saveManifest = async (dst, timestamp, pathHash) => {
  pathHash = pathHash.sort()
  const content = pathHash.map(
    ([path, hash]) => `${path},${hash}`).join('\n')
  const manifest = `${dst}/${timestamp}.csv`
  return fs.writeFile(manifest, content, 'utf-8')
}

export default backup
