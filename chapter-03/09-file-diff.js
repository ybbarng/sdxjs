/**
 * 명령행 인수로 받은 두 파일을 읽어서 모든 줄을 자신이 포함된 파일 정보와 함께 출력한다.
 *
 * 해당 줄이 두 파일에 모두 있는 경우 *, 첫 번째 파일에만 있는 경우 1, 두 번째 파일에만 있는 경우 2로 표시한다.
 *
 * 예시)
 * $ node 09-file-diff.js left.txt right.txt
 *
 * * some
 * 1 people
 * 2 write
 * 2 code
 */
import fs from 'fs-extra-promise';

// 각 줄을 가지고 있는 대상을 나타내기 위한 이름
const OWNER_1 = "left";
const OWNER_2 = "right";

/**
 * 두 파일의 모든 줄을 가지는 Map
 * value는 해당 줄을 가지고 있는 파일의 Set이다.
 *
 * 예시)
 * {
 *   some: Set(["left", "right"]),
 *   people: Set(["left"]),
 *   write: Set(["right"])
 * }
 */
const allLines = new Map();

/**
 * 파일을 열어서 모든 줄의 배열을 반환하는 함수
 */
const readLines = async (filename) => {
  const data = await fs.readFileAsync(filename, 'utf-8');
  // 마지막 줄은 파일 끝의 빈 줄이므로 제거
  return data.split("\n").slice(0, -1);
}

/**
 * map에 줄과 소유자 이름을 등록하는 함수
 */
const register = (map, line, label) => {
  if (map.has(line)) {
    map.get(line).add(label);
  } else {
    map.set(line, new Set([label]));
  }
}

/**
 * 줄을 가진 소유자의 상태에 따라 적절한 식별자를 반환한다.
 */
const createMarker = (owners) => {
  if (owners.size === 2) {
    return "*";
  }
  if (owners.has(OWNER_1)) {
    return "1";
  }
  return "2";
}

/**
 * 프로그램 주요 로직
 *
 * 1. 파일을 읽어서 줄 배열 얻기
 * 2. allLines에 줄과 소유자 등록하기
 * 3. 소유자 마커와 줄 출력하기
 */
const main = async (file1, file2) => {

  const file1Lines = await readLines(file1)
  const file2Lines = await readLines(file2)

  file1Lines.forEach((line) => {
    register(allLines, line, OWNER_1);
  });
  file2Lines.forEach((line) => {
    register(allLines, line, OWNER_2);
  });

  Array.from(allLines)
    .map(([line, owners]) => ({
      marker: createMarker(owners),
      line,
    }))
    .map(({marker, line}) => console.log(`${marker} ${line}`));
}

// node 09-file-diff.js <file1> <file2>
const file1 = process.argv[2];
const file2 = process.argv[3];
main(file1, file2);
