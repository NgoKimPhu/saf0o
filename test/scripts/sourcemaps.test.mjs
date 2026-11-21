import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { splitSourceMaps } from '../../scripts/split-sourcemaps.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sourcemaps-'))
const shipped = (dir) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())

// The packaged app must not carry maps: they hold the full source and roughly 24 MB for the renderers.
// The maps stay in sourcemaps/ so a minified stack trace can still be mapped back.
test('splitSourceMaps moves file and inline maps out and strips the comments', async () => {
  const dir = tmp()
  const out = tmp()
  try {
    const inline = Buffer.from('{"version":3,"inline":1}').toString('base64')
    fs.mkdirSync(path.join(dir, 'sub'))
    fs.writeFileSync(path.join(dir, 'a.js'), 'x()\n//# sourceMappingURL=a.js.map\n')
    fs.writeFileSync(path.join(dir, 'a.js.map'), '{"version":3,"file":1}')
    fs.writeFileSync(
      path.join(dir, 'sub/b.js'),
      `y()\n//# sourceMappingURL=data:application/json;base64,${inline}`
    )
    fs.writeFileSync(path.join(dir, 'c.css'), 'a{}\n/*# sourceMappingURL=c.css.map */')
    fs.writeFileSync(path.join(dir, 'c.css.map'), '{"version":3,"css":1}')
    assert.equal(await splitSourceMaps(dir, 'n', out), 3)
    for (const file of shipped(dir)) {
      const full = path.join(file.parentPath, file.name)
      assert.ok(!full.endsWith('.map'), `${full} would ship`)
      assert.ok(!/sourceMappingURL/.test(fs.readFileSync(full, 'utf8')), `${full} keeps its comment`)
    }
    assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'x()')
    assert.equal(fs.readFileSync(path.join(out, 'n/sub/b.js.map'), 'utf8'), '{"version":3,"inline":1}')
    assert.ok(fs.existsSync(path.join(out, 'n/a.js.map')) && fs.existsSync(path.join(out, 'n/c.css.map')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(out, { recursive: true, force: true })
  }
})

// Parcel emits no map unless sourceMaps is on, so this fails if the main bundle goes back to no maps.
test('the main bundle build produces maps and the split ships none', () => {
  const dir = tmp()
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}')
    fs.writeFileSync(
      path.join(dir, 'entry.js'),
      'module.exports = function boom() { throw new Error("x") }\n'
    )
    const script = `import { parcelBuild } from ${JSON.stringify(path.join(root, 'scripts/bundle-main.mjs'))}
import { splitSourceMaps } from ${JSON.stringify(path.join(root, 'scripts/split-sourcemaps.mjs'))}
await parcelBuild([${JSON.stringify(path.join(dir, 'entry.js'))}], ${JSON.stringify(path.join(dir, 'out'))})
console.log(await splitSourceMaps(${JSON.stringify(path.join(dir, 'out'))}, 'm', ${JSON.stringify(path.join(dir, 'maps'))}))`
    const count = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: dir,
      encoding: 'utf8'
    })
    assert.equal(count.trim(), '1')
    assert.ok(fs.existsSync(path.join(dir, 'maps/m/entry.js.map')))
    assert.ok(!fs.readFileSync(path.join(dir, 'out/entry.js'), 'utf8').includes('sourceMappingURL'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// bundle/ and compiled-bundle/ are packed whole. Both builds must call splitSourceMaps, and the
// electron-builder files must not reach sourcemaps/ or any .map. Checks the built output when present.
test('packaged output has no maps and the build scripts split them out', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.match(pkg.scripts.bundle, /bundle:maps.*bundle:csp/)
  assert.match(fs.readFileSync(path.join(root, 'scripts/bundle-main.mjs'), 'utf8'), /splitSourceMaps\(out/)
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^sourcemaps$/m)
  process.env.SAF0O_WINDOWS_SIGNING = 'skip'
  const { files } = require('../../build/electron-builder-windows.js')
  assert.ok(files.every((entry) => typeof entry !== 'string' || !/sourcemaps/.test(entry)))
  for (const dir of ['bundle', 'compiled-bundle']) {
    if (!fs.existsSync(path.join(root, dir))) continue
    for (const file of shipped(path.join(root, dir))) {
      const full = path.join(file.parentPath, file.name)
      assert.ok(!full.endsWith('.map'), `${full} would be packaged`)
      if (/\.(js|css)$/.test(full) && fs.statSync(full).size < 5e7)
        assert.ok(!/sourceMappingURL=/.test(fs.readFileSync(full, 'utf8')), `${full} has a sourceMappingURL`)
    }
  }
})
