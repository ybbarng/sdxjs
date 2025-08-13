/**
 * 이중루프 구현
 */
export function joinNaive(left, right) {
  const out = [];
  for (let l = 0; l < left.length; l++) {
    for (let r = 0; r < right.length; r++) {
      if (left[l].key === right[r].key) {
        out.push({
          key: left[l].key,
          left: left[l].left,
          right: right[r].right,
        });
      }
    }
  }
  return out;
}

/**
 *  인덱스 조인 구현
 */
export function joinIndex(left, right) {
  // 인덱스 생성
  const index = new Map();
  for (let r = 0; r < right.length; r++) {
    let bucket = index.get(right[r].key)
    if (!bucket) {
      bucket = []
      index.set(right[r].key, bucket)
    }
    bucket.push(right[r])
  }
  // 인덱스 생성 끝

  const out = [];
  for (let l = 0; l < left.length; l++) {
    const matches = index.get(left[l].key);
    if (!matches) {
      continue;
    }
    for (let m = 0; m < matches.length; m++) {
      out.push({
        key: left[l].key,
        left: left[l].left,
        right: matches[m].right,
      });
    }
  }
  return out;
}

const left =  [
  { key: 'A', left: 'a1' },
  { key: 'B', left: 'b1' },
  { key: 'C', left: 'c1' },
]
const right = [
  { key: 'A', right: 'a2' },
  { key: 'A', right: 'a3' },
  { key: 'B', right: 'b2' },
]

console.log("naive: ", joinNaive(left, right))
console.log("index: ", joinIndex(left, right))
