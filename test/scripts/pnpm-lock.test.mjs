import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  componentFor,
  lockedVersion,
  parsePnpmLock,
  productionGraph,
  readPnpmLock
} from '../../scripts/pnpm-lock.mjs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = readPnpmLock('.')
const graph = productionGraph(lock, 'saf0o@0')

test('production closure holds every direct dependency and no development-only package', () => {
  for (const name of Object.keys(packageJson.dependencies)) {
    assert.ok(graph.get('saf0o@0').has(`${name}@${lockedVersion(lock, name)}`), name)
  }
  const development = Object.keys(packageJson.devDependencies).filter(
    (name) => !(name in packageJson.dependencies)
  )
  const production = new Set([...graph.keys()].map((ref) => ref.slice(0, ref.lastIndexOf('@'))))
  assert.ok(development.length > 0 && development.some((name) => !production.has(name)))
  for (const name of ['jest', 'electron-builder']) {
    if (name in packageJson.devDependencies) assert.ok(!production.has(name), name)
  }
})

test('component hash is the lockfile integrity, so the SBOM binds to locked tarballs', () => {
  const [reference] = [...lock.integrity.keys()]
  const [hash] = componentFor(lock, reference).hashes
  assert.equal(hash.alg, 'SHA-512')
  assert.equal(Buffer.from(hash.content, 'hex').toString('base64'), lock.integrity.get(reference).slice(7))
})

test('local file dependency uses its package version and scoped names split into group', () => {
  assert.equal(lockedVersion(lock, 'react-restore'), '0.6.2-frame.2')
  assert.deepEqual(
    [componentFor(lock, '@scope/pkg@1.0.0').group, componentFor(lock, '@scope/pkg@1.0.0').purl],
    ['@scope', 'pkg:npm/%40scope/pkg@1.0.0']
  )
})

test('a transitive parent resolves its own dependency version', () => {
  assert.match(lockedVersion(lock, 'usb', '@trezor/transport'), /^\d+\.\d+\.\d+$/)
})

// Windows CI checks the lockfile out with CRLF; the '\r' hid the root importer and every version read undefined.
test('a CRLF lockfile parses like the LF one', () => {
  const crlf = parsePnpmLock(readFileSync('pnpm-lock.yaml', 'utf8').replace(/\n/g, '\r\n'))
  assert.equal(
    lockedVersion(crlf, 'usb', '@trezor/transport'),
    lockedVersion(lock, 'usb', '@trezor/transport')
  )
})
