import fs from 'fs-extra-promise';

const OWNER_1 = "left";
const OWNER_2 = "right";

const readLines = async (filename, label) => {
  const data = await fs.readFileAsync(filename, 'utf-8');
  // 마지막 줄은 파일 끝의 빈 줄이므로 제거
  return data.split("\n").slice(0, -1);
}

const register = (map, line, label) => {
  if (map.has(line)) {
    map.get(line).add(label);
  } else {
    map.set(line, new Set([label]));
  }
  map
}

const createMarker = (owners) => {
  if (owners.size === 2) {
    return "*";
  }
  if (owners.has(OWNER_1)) {
    return "1";
  }
  return "2";
}

const main = async (file1, file2) => {
  const allLines = new Map();

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

// node 09-file-diff.js left.txt right.txt
const file1 = process.argv[2];
const file2 = process.argv[3];
main(file1, file2);
