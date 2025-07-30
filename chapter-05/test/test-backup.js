import { strict as assert } from 'node:assert'
import fs from 'fs/promises'
import { glob } from 'glob'
import mock from 'mock-fs'
import crypto from 'crypto'

import backup from '../backup.js'

// [fixtures]
const hashString = (data) => {
  const hasher = crypto.createHash('sha1').setEncoding('hex')
  hasher.write(data)
  hasher.end()
  return hasher.read()
}

const Contents = {
  aaa: 'AAA',
  bbb: 'BBB',
  ccc: 'CCC'
}

const Hashes = Object.keys(Contents).reduce((obj, key) => {
  obj[key] = hashString(Contents[key])
  return obj
}, {})

const Fixture = {
  source: {
    'alpha.txt': Contents.aaa,
    'beta.txt': Contents.bbb,
    gamma: {
      'delta.txt': Contents.ccc
    }
  },
  backup: {}
}

const InitialBackups = Object.keys(Hashes).reduce((set, filename) => {
  set.add(`backup/${Hashes[filename]}.bck`)
  return set
}, new Set())
// [/fixtures]

// [tests]
describe('check entire backup process', () => {
  beforeEach(() => {
    mock(Fixture, {
      createCwd: false,
      createTmp: false
    })
  })

  afterEach(() => {
    mock.restore()
  })

  it('creates an initial CSV manifest', async () => {
    await backup('source', 'backup', 0)

    const all = await glob('backup/*')
    assert.strictEqual(all.length, 4, 'Expected 4 files')

    const actualBackups = new Set(await glob('backup/*.bck'))
    assert.deepStrictEqual(actualBackups, InitialBackups, 'Expected 3 backup files')

    const actualManifests = await glob('backup/*.csv')
    assert.deepStrictEqual(actualManifests, ['backup/0000000000.csv'], 'Expected one manifest')
  })

  it('does not duplicate files unnecessarily', async () => {
    await backup('source', 'backup', 0)
    assert.strictEqual((await glob('backup/*')).length, 4, 'Expected 4 files after first backup')

    await backup('source', 'backup', 1)
    assert.strictEqual((await glob('backup/*')).length, 5, 'Expected 5 files after second backup')

    const actualBackups = new Set(await glob('backup/*.bck'))
    assert.deepStrictEqual(actualBackups, InitialBackups, 'Expected 3 backup files after second backup')

    const actualManifests = (await glob('backup/*.csv')).sort()
    assert.deepStrictEqual(actualManifests,
      ['backup/0000000000.csv', 'backup/0000000001.csv'],
      'Expected two manifests')
  })

  it('adds a file as needed', async () => {
    await backup('source', 'backup', 0)
    assert.strictEqual((await glob('backup/*')).length, 4, 'Expected 4 files after first backup')

    await fs.writeFile('source/newfile.txt', 'NNN')
    const hashOfNewFile = hashString('NNN')

    await backup('source', 'backup', 1)
    assert.strictEqual((await glob('backup/*')).length, 6, 'Expected 6 files after second backup')

    const expected = new Set(InitialBackups)
    expected.add(`backup/${hashOfNewFile}.bck`)

    const actualBackups = new Set(await glob('backup/*.bck'))
    assert.deepStrictEqual(actualBackups, expected, 'Expected 4 backup files after second backup')

    const actualManifests = (await glob('backup/*.csv')).sort()
    assert.deepStrictEqual(actualManifests,
      ['backup/0000000000.csv', 'backup/0000000001.csv'],
      'Expected two manifests')
  })
})
// [/tests]
