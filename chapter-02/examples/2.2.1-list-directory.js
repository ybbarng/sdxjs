import { readdir } from 'node:fs/promises';

const srcDir = process.argv[2]
const results = await readdir(srcDir)
for (const name of results) {
  console.log(name)
}
