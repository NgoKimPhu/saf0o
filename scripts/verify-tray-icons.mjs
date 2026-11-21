import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'

const iconSpecs = [
  { name: 'Icon.png', exportName: 'saf0o-tray-24.png', size: 24 },
  { name: 'Icon@2x.png', exportName: 'saf0o-tray-48.png', size: 48 }
]

for (const { name, exportName, size } of iconSpecs) {
  const source = await readFile(path.resolve('main/windows', name))
  const compiled = await readFile(path.resolve('compiled/main/windows', name))
  const durableExport = await readFile(path.resolve('asset/brand/exports/tray', exportName))
  assert.deepEqual(compiled, source, `${name} was not copied intact`)
  assert.deepEqual(source, durableExport, `${name} must match ${exportName}`)

  const icon = PNG.sync.read(source)
  assert.equal(icon.width, size, `${name} must be ${size}px wide`)
  assert.equal(icon.height, size, `${name} must be ${size}px high`)

  const alpha = []
  const visibleBounds = { minX: size, minY: size, maxX: -1, maxY: -1 }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = icon.data[(y * size + x) * 4 + 3]
      alpha.push(value)
      if (value >= 32) {
        visibleBounds.minX = Math.min(visibleBounds.minX, x)
        visibleBounds.minY = Math.min(visibleBounds.minY, y)
        visibleBounds.maxX = Math.max(visibleBounds.maxX, x)
        visibleBounds.maxY = Math.max(visibleBounds.maxY, y)
      }
    }
  }

  const visiblePixels = alpha.filter((value) => value >= 32).length
  const opaquePixels = alpha.filter((value) => value >= 128).length
  const pixelCount = icon.width * icon.height

  assert.ok(visiblePixels >= pixelCount * 0.1, `${name} has too little visible artwork`)
  assert.ok(opaquePixels >= pixelCount * 0.08, `${name} is effectively transparent`)
}

console.log('Cross-platform tray icons verified')
