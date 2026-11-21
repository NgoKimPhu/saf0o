import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PNG } from 'pngjs'
import { resizePng, resizedPngBuffer } from '../../scripts/brand-resample.mjs'

const solid = (size, [r, g, b, a]) => {
  const png = new PNG({ width: size, height: size })
  for (let i = 0; i < png.data.length; i += 4) png.data.set([r, g, b, a], i)
  return png
}

test('resampling keeps flat colour flat in both directions', () => {
  for (const size of [16, 96, 512]) {
    const out = resizePng(solid(96, [10, 200, 90, 255]), size)
    for (let i = 0; i < out.data.length; i += 4) {
      assert.deepEqual([...out.data.subarray(i, i + 4)], [10, 200, 90, 255])
    }
  }
})

test('transparent corners do not bleed their colour into the plate edge', () => {
  const src = solid(8, [0, 255, 0, 255])
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) src.data.set([255, 0, 0, 0], (y * 8 + x) * 4)
  const out = resizePng(src, 64)
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] > 0)
      assert.ok(out.data[i] <= 2, 'red from the transparent corner leaked into visible pixels')
  }
})

test('every runtime app icon is derived from the one PNG master', async () => {
  const master = PNG.sync.read(await readFile('asset/brand/saf0o-app-icon-master.png'))
  for (const file of ['build/icons/icon.png', 'build/icons/512x512.png', 'main/windows/AppIcon.png']) {
    assert.deepEqual(
      await readFile(file),
      resizedPngBuffer(master, 512),
      `${file} is not the 512px resample of the master`
    )
  }
})

test('tray icons are the master resampled to 24px and 48px, on every platform', async () => {
  const master = PNG.sync.read(await readFile('asset/brand/saf0o-app-icon-master.png'))
  for (const [size, name] of [
    [24, 'Icon.png'],
    [48, 'Icon@2x.png']
  ]) {
    const expected = resizedPngBuffer(master, size)
    assert.deepEqual(
      await readFile(`main/windows/${name}`),
      expected,
      `${name} is not derived from the master`
    )
    assert.deepEqual(await readFile(`asset/brand/exports/tray/saf0o-tray-${size}.png`), expected)
  }
  const source = await readFile('main/windows/systemTray.ts', 'utf8')
  assert.match(
    source,
    /systemTrayIcon = 'Icon\.png'/,
    'one colour icon for all platforms; a Template-suffixed colour plate renders as a black square on macOS'
  )
})
