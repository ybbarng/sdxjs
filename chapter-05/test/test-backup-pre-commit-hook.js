import { strict as assert } from 'node:assert'
import fs from 'fs/promises'
import { glob } from 'glob'
import mock from 'mock-fs'
import crypto from 'crypto'

import backup from '../backup.js'

// [fixtures]
const Contents = {
  aaa: 'AAA',
  bbb: 'BBB',
  ccc: 'CCC'
}

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

// [tests]
describe('pre-commit hook 동작에 따른 백업 테스트', () => {

  afterEach(() => {
    mock.restore()
  })

  it('pre-commit hook이 true를 리턴하면, 백업을 진행한다.', async () => {
    const trueHook = "function preCommit() { return true; }";

    mockFixtureWithHook(trueHook);

    await backup('source', 'backup', 0)

    const all = await glob('backup/*')
    assert.strictEqual(all.length, 5, 'Expected 5 files')
  })

  it('pre-commit hook이 false를 리턴하면, 백업을 중단한다.', async () => {
    const falseHook = "function preCommit() { return false; }";

    mockFixtureWithHook(falseHook);

    await backup('source', 'backup', 0)

    const all = await glob('backup/*')
    assert.strictEqual(all.length, 0, 'Expected 0 files')
  })

  it('pre-commit hook에서 에러가 발생하면, 백업을 중단한다.', async () => {
    const errorHook = "function preCommit() { throw new Error(); }";

    mockFixtureWithHook(errorHook);

    await backup('source', 'backup', 0)

    const all = await glob('backup/*')
    assert.strictEqual(all.length, 0, 'Expected 0 files')
  })
})
// [/tests]

// [helpers]
const mockFixtureWithHook = (hookCode) => {
  const fixture = structuredClone(Fixture)
  fixture.source['pre-commit.js'] = hookCode
  mock(fixture, { createCwd: false, createTmp: false })
}
// [/helpers]
