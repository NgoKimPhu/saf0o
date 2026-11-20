import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '../..')

// hotkeys-js 4 declares a `browser` field pointing at a global-script build with no exports. Parcel's
// "browser" context picks it, so `import hotkeys` becomes `{}` and the shortcut Edit button crashed the
// dash with "hotkeys is not a function". package.json `alias` must pin the ES module build.
test('dash-style Parcel bundle resolves hotkeys-js to a callable function', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotkeys-bundle-'))
  try {
    const { alias } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        private: true,
        alias: { 'hotkeys-js': path.relative(dir, path.join(root, alias['hotkeys-js'])) },
        targets: { t: { context: 'browser', distDir: './out' } }
      })
    )
    fs.writeFileSync(
      path.join(dir, 'e.js'),
      "import hotkeys from 'hotkeys-js'\nwindow.__type = typeof hotkeys\n"
    )
    fs.writeFileSync(path.join(dir, 'i.html'), '<script type="module" src="e.js"></script>')
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/.bin/parcel'),
        'build',
        '--no-cache',
        '--no-optimize',
        '--no-autoinstall',
        '--target',
        't',
        'i.html'
      ],
      { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', TERM: 'dumb' } }
    )
    const js = fs.readdirSync(path.join(dir, 'out')).find((f) => f.endsWith('.js'))
    const sandbox = { navigator: { userAgent: 'x' }, document: {} }
    sandbox.window = sandbox
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'out', js), 'utf8'), sandbox)
    assert.equal(sandbox.__type, 'function')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
