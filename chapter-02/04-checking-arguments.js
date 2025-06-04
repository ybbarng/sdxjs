

function copy(srcDir, dstDir) {
  console.log(`Copy from ${srcDir} to ${dstDir}`);
}


function runOriginal() {
  const [srcDir, dstDir] = process.argv.slice(2)

  copy(srcDir, dstDir);
}

function runNew() {
  const argv = process.argv;

  if (argv.length < 4) {
    console.log("복사할 원본 폴더와 대상 폴더를 인수로 추가해 주세요:\n예시) node 04-checking-arguments.js 원본폴더 대상폴더");
    process.exit(1);
  }
  const [srcDir, dstDir] = process.argv.slice(2)
  copy(srcDir, dstDir);
}

// runOriginal();
runNew();
