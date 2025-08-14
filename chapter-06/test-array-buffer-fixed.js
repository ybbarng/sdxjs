import assert from 'assert'
import microtime from 'microtime'
import sizeof from 'object-sizeof'
import yaml from 'js-yaml'

import { buildCols } from './build.js'

/**
 * 사용법
 *
 * node test-array-buffer.js 5 5
 */

// 헥스(왼쪽) + ASCII(오른쪽) 한 줄 16바이트 기본, 8바이트마다 간격
function dumpHexAscii(
  u8,
  { limit = u8.length, bytesPerLine = 16, groupSize = 8, showOffset = true, offsetBase = 0 } = {}
) {
  const n = Math.min(u8.length, limit);
  const b2h = b => b.toString(16).padStart(2, "0");
  const printable = b => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".");
  const fullHexWidth =
    (bytesPerLine * 3 - 1) + Math.floor((bytesPerLine - 1) / groupSize); // 'xx ' 반복 + 그룹 간 공백

  // 동적 주소 너비(최소 8)
  const maxAddr = offsetBase + (n ? n - 1 : 0);
  const addrWidth = Math.max(8, Math.ceil(Math.log2(Math.max(1, maxAddr + 1)) / 4));

  let out = "";
  for (let i = 0; i < n; i += bytesPerLine) {
    const end = Math.min(i + bytesPerLine, n);
    const slice = u8.subarray(i, end);

    // 왼쪽: HEX
    let hexParts = [];
    for (let j = 0; j < slice.length; j++) {
      hexParts.push(b2h(slice[j]));
      if (j !== slice.length - 1) hexParts.push(" ");
      if ((j + 1) % groupSize === 0 && j !== slice.length - 1) hexParts.push(" ");
    }
    const hexStr = hexParts.join("").padEnd(fullHexWidth, " ");

    // 오른쪽: ASCII
    const asciiStr = [...slice].map(printable).join("");

    // 주소(옵션) + 구분자
    const addr = showOffset ? `${(offsetBase + i).toString(16).padStart(addrWidth, "0")}  ` : "";
    out += `${addr}${hexStr} | ${asciiStr}\n`;
  }
  return out.trimEnd();
}

const main = () => {
  const nRows = parseInt(process.argv[2])
  const nCols = parseInt(process.argv[3])

  const labels = [...Array(nCols).keys()].map(i => `label_${i + 1}`)
  const someLabels = labels.slice(0, Math.floor(labels.length / 2))
  assert(someLabels.length > 0,
    'Must have some labels for select (array too short)')

  const colTable = buildCols(nRows, labels)

  console.log(colTable);
  console.log(dumpHexAscii(asBinary(colTable)));
}

// [binary]
const asBinary = (table) => {
  const labels = Object.keys(table)

  const nCols = labels.length
  const nRows = table[labels[0]].length
  const dimensions = new Uint32Array([nCols, nRows])

  const allLabels = labels.join('\n')
  const encoder = new TextEncoder()
  const encodedLabels = encoder.encode(allLabels)

  const dataSize = sizeof(0) * nCols * nRows
  const totalSize =
    dimensions.byteLength + encodedLabels.byteLength + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const result = new Uint8Array(buffer)
  result.set(new Uint8Array(dimensions.buffer, dimensions.byteOffset, dimensions.byteLength), 0); // 수정
  result.set(encodedLabels, dimensions.byteLength)

  let current = dimensions.byteLength + encodedLabels.byteLength
  labels.forEach(label => {
    const temp = new Float64Array(table[label])
    result.set(new Uint8Array(temp.buffer, temp.byteOffset, temp.byteLength), current); // 수정
    current += temp.byteLength
  })

  return result
}
// [/binary]

main()
