import fs from 'fs/promises'
import path from 'path'
import vm from 'vm'

import hashExisting from './hash-existing-promise.js'
import findNew from './check-existing-files.js'

const isPreCommitHookPassed = async(src) => {
  const filePath = path.join(src, 'pre-commit.js');

  try {
    const hook = await fs.readFile(filePath, 'utf-8');

    // 스크립트 실행 환경 셋업
    const context = {};
    vm.createContext(context);

    const script = new vm.Script(hook);
    script.runInContext(context);
    // 스크립트 실행 환경 셋업 끝

    if (typeof context.preCommit === 'function') {
      // pre-commit hook의 결과에 따라 진행 여부 결정
      return context.preCommit()
    }

  } catch (error) {
    // pre-commit hook 파일이 없는 경우는 정상 진행
    if (error.code === 'ENOENT') return true;

    // 그 외에는 에러 발생
    throw error;
  }
  console.log("pre-commit.js", preCommitFile);
  console.log("alpha", alpha);
  if (!preCommitFile) {
    return true;
  }
}

const backup = async (src, dst, timestamp = null) => {
  // pre-commit hook 처리
  try {
    if (!await isPreCommitHookPassed(src)) {
      return;
    }
  } catch (error) {
    // 에러가 발생하면 백업 중단
    console.error(error);
    return;
  }
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
