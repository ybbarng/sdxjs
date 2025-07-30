import { glob } from 'glob'       // ✅ 최신 glob v11
import path from 'path'

const findNew = async (rootDir, pathHashPairs) => {
  // hash -> path 매핑
  const hashToPath = pathHashPairs.reduce((obj, [path, hash]) => {
    obj[hash] = path
    return obj
  }, {})

  const pattern = `${rootDir}/*.bck`
  const options = {}               // 필요 시 glob 옵션 추가 가능
  const existingFiles = await glob(pattern, options)

  // 존재하는 .bck 파일들의 해시를 제거
  existingFiles.forEach(filename => {
    const stripped = path.basename(filename).replace(/\.bck$/, '')
    delete hashToPath[stripped]
  })

  return hashToPath
}

export default findNew
