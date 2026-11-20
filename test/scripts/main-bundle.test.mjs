import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import process from 'node:process'
import path from 'node:path'
import test from 'node:test'
import { ENTRIES, EXTERNAL, rewriteDirname, verifyBundle } from '../../scripts/bundle-main.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const { externalModuleDirs } = require('../../build/main-bundle.js')
const windowsConfig = () => {
  process.env.SAF0O_WINDOWS_SIGNING = 'skip'
  return require('../../build/electron-builder-windows.js')
}

const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|js)$/.test(entry.name) ? [full] : []
  })

// A file the main process forks or hands to Electron by path cannot live inside the bundle. A new
// `path.resolve(__dirname, 'x.js')` without an entry would ship a build that cannot start that worker.
test('every file that main loads by __dirname path is a bundle entry', () => {
  const main = path.join(root, 'main')
  const loaded = new Set()
  for (const file of sourceFiles(main)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const [, name] of text.matchAll(/__dirname,\s*'([^']+\.js)'/g)) {
      loaded.add(
        path
          .join(path.relative(main, path.dirname(file)), name)
          .split(path.sep)
          .join('/')
      )
    }
  }
  assert.ok(loaded.size >= 4, `expected the balances, signer and preload files, found ${[...loaded]}`)
  for (const file of loaded)
    assert.ok(ENTRIES.includes(file), `${file} is loaded by path but is not a bundle entry`)
  for (const entry of ENTRIES) {
    const base = path.join(main, entry.replace(/\.js$/, ''))
    assert.ok(fs.existsSync(`${base}.ts`) || fs.existsSync(`${base}.js`), `${entry} has no source file`)
  }
})

// Parcel resolves the alias block in package.json (stream, path, crypto, buffer ... stubbed for the
// renderers) before it treats a Node builtin as external. Without the resolver in scripts/main-bundle,
// ws's `class Receiver extends Writable` threw at startup because `stream` was an empty module.
test('main bundle keeps Node builtins real despite the renderer alias block', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-bundle-'))
  try {
    const { alias } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, alias }))
    fs.writeFileSync(
      path.join(dir, 'entry.js'),
      `const { Writable } = require('stream')
const path = require('path')
const { Buffer: B } = require('node:buffer')
class Sink extends Writable {}
console.log(new Sink() instanceof Writable, path.join('a', 'b'), B === Buffer)`
    )
    const out = path.join(dir, 'out')
    // A child process: Parcel's worker threads reject the execArgv that `node --test` passes down.
    const script = `import { parcelBuild } from ${JSON.stringify(path.join(root, 'scripts/bundle-main.mjs'))}
await parcelBuild([${JSON.stringify(path.join(dir, 'entry.js'))}], ${JSON.stringify(out)})`
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: dir, stdio: 'pipe' })
    const printed = execFileSync(process.execPath, [path.join(out, 'entry.js')], { encoding: 'utf8' })
    assert.equal(printed.trim(), 'true a/b true')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rewriteDirname points Parcel source-relative __dirname back into the bundle layout', () => {
  const out = path.join(root, 'compiled-bundle')
  const parcel = (rel) => `x.resolve(__dirname, "${rel}")`
  assert.equal(
    rewriteDirname(parcel('../compiled/main/windows'), path.join(out, 'index.js')),
    'x.resolve(__dirname,"windows")'
  )
  assert.equal(
    rewriteDirname(parcel('../compiled/main'), path.join(out, 'index.js')),
    'x.resolve(__dirname,".")'
  )
  assert.throws(
    () => rewriteDirname(parcel('../node_modules/some-package'), path.join(out, 'index.js')),
    /outside compiled\/main/
  )
})

test('verifyBundle rejects a bundled native-binding loader and a missing entry', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-bundle-verify-'))
  try {
    await assert.rejects(verifyBundle(dir), /ENOENT/)
    for (const entry of ENTRIES) {
      fs.mkdirSync(path.dirname(path.join(dir, entry)), { recursive: true })
      fs.writeFileSync(path.join(dir, entry), '"use strict"')
    }
    await verifyBundle(dir)
    fs.writeFileSync(path.join(dir, 'chunk.js'), 'require("node-gyp-build")(__dirname)')
    await assert.rejects(verifyBundle(dir), /EXTERNAL/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Anything left external must ship in the package with its runtime dependencies and nested versions,
// and nothing else from node_modules. The signer path needs the nested node-hid 2.1.2.
test('the Windows package ships the bundle plus every external and its dependency tree', () => {
  const { files } = windowsConfig()
  assert.deepEqual(files[0], { from: 'compiled-bundle', to: 'compiled/main' })
  assert.ok(files.includes('package.json'), 'electron-builder rejects an asar without package.json')
  assert.ok(!files.includes('compiled'), 'the unbundled compiled/ tree must not ship next to the bundle')
  assert.ok(files.indexOf('!node_modules/**') < files.indexOf('node_modules/usb/**'))
  const dirs = externalModuleDirs(root)
  for (const name of EXTERNAL.filter((external) => external !== 'electron')) {
    assert.ok(dirs.includes(`node_modules/${name}`), `${name} is missing from the packaged files`)
    assert.ok(files.includes(`node_modules/${name}/**`))
  }
  assert.ok(
    dirs.includes('node_modules/@ledgerhq/hw-transport-node-hid-noevents/node_modules/node-hid'),
    'the nested node-hid the Ledger transport loads must ship'
  )
  assert.ok(dirs.includes('node_modules/node-gyp-build') || dirs.includes('node_modules/bindings'))
})
