import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import process from 'node:process'
import path from 'node:path'
import test from 'node:test'
import { PNG } from 'pngjs'

test('companion icons derive from the desktop master and keep the status meaning', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'saf0o-companion-icons-'))
  try {
    execFileSync(process.execPath, ['scripts/generate-companion-icons.mjs', dir], { stdio: 'pipe' })
    const read = async (file) => readFile(path.join(dir, 'src', file))
    // The companion brand check requires src/icon.png to equal the desktop canonical icon.
    assert.deepEqual(await read('icon.png'), await readFile('build/icons/icon.png'))
    for (const size of [16, 48, 96]) {
      const color = await read(`icons/icon${size}.png`)
      assert.deepEqual(await read(`icons/icon${size}good.png`), color, 'connected icon is the colour icon')
      const moon = PNG.sync.read(await read(`icons/icon${size}moon.png`))
      assert.equal(moon.width, size)
      for (let i = 0; i < moon.data.length; i += 4) {
        assert.ok(
          moon.data[i] === moon.data[i + 1] && moon.data[i] === moon.data[i + 2],
          'disconnected icon must be grey'
        )
      }
    }
    const store = PNG.sync.read(await read('icons/icon128.png'))
    assert.equal(store.width, 128)
    assert.equal(store.data[3], 0, 'store icon keeps its transparent safe area')
    assert.equal(store.data[(64 * 128 + 64) * 4 + 3], 255)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
