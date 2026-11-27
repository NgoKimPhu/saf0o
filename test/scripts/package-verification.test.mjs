import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertBundledProbe,
  assertNativeHost,
  assertSafeArchiveEntries,
  getPackageTarget,
  selectPackageArtifacts
} from '../../scripts/package-verification.mjs'
import { assertAdHocSignatureDetails } from '../../scripts/verify-macos-preview.mjs'

test('accepts only an ad-hoc macOS application identity without an Apple authority', () => {
  const details = [
    'Executable=/Volumes/Saf0o/Saf0o.app/Contents/MacOS/Saf0o',
    'Identifier=io.github.ngokimphu.saf0o',
    'Signature=adhoc',
    'TeamIdentifier=not set'
  ].join('\n')
  assert.doesNotThrow(() => assertAdHocSignatureDetails(details))
  assert.throws(() =>
    assertAdHocSignatureDetails(details.replace('Signature=adhoc', 'Signature=Developer ID'))
  )
  assert.throws(() => assertAdHocSignatureDetails(`${details}\nAuthority=Developer ID Application: Example`))
  assert.throws(() =>
    assertAdHocSignatureDetails(details.replace('TeamIdentifier=not set', 'TeamIdentifier=TEAM'))
  )
})

test('rejects missing, duplicate, stale, and unknown package outputs', () => {
  const target = getPackageTarget('linux-x64')
  assert.throws(() => selectPackageArtifacts([], target, '0.1.0'), /Expected one AppImage/)
  assert.throws(
    () =>
      selectPackageArtifacts(
        ['Saf0o-0.1.0.AppImage', 'Saf0o-0.1.0.AppImage', 'saf0o_0.1.0_amd64.deb'],
        target,
        '0.1.0'
      ),
    /Expected one AppImage, found 2/
  )
  assert.throws(
    () => selectPackageArtifacts(['Saf0o-0.0.9.AppImage', 'saf0o_0.0.9_amd64.deb'], target, '0.1.0'),
    /Expected one AppImage, found 0/
  )
  assert.throws(() => getPackageTarget('plan9-x64'), /Unknown package verification target/)
  assert.throws(() => getPackageTarget('__proto__'), /Unknown package verification target/)
})

test('requires a matching native host before executing the package', () => {
  const target = getPackageTarget('mac-arm64')
  assert.doesNotThrow(() => assertNativeHost(target, { platform: 'darwin', arch: 'arm64' }))
  assert.throws(() => assertNativeHost(target, { platform: 'linux', arch: 'arm64' }), /requires macOS/)
  assert.throws(() => assertNativeHost(target, { platform: 'darwin', arch: 'x64' }), /requires arm64/)
})

test('rejects archive entries that could escape their disposable extraction root', () => {
  assert.doesNotThrow(() => assertSafeArchiveEntries(['Saf0o/', 'Saf0o/resources/app.asar']))
  assert.throws(() => assertSafeArchiveEntries([]), /archive is empty/)
  assert.throws(() => assertSafeArchiveEntries(['/etc/passwd']), /Absolute package archive entry/)
  assert.throws(() => assertSafeArchiveEntries(['C:\\Windows\\system.ini']), /Drive-qualified/)
  assert.throws(() => assertSafeArchiveEntries(['Saf0o/../../outside']), /escapes extraction root/)
  assert.throws(() => assertSafeArchiveEntries(['Saf0o/evil\0name']), /null byte/)
})

// Windows ships the Parcel main bundle: the full probe loads packages it no longer ships and always failed.
test('probes the Windows package for its bundled layout and rejects a missing external', () => {
  assert.equal(getPackageTarget('windows-x64').bundledMain, true)
  assert.equal(getPackageTarget('linux-x64').bundledMain, undefined)
  const packageJson = {
    dependencies: { 'node-hid': '3.0.0', '@ledgerhq/hw-transport-node-hid-noevents': '6.0.0' }
  }
  const lock = { importers: {}, packages: {}, snapshots: {} }
  assert.throws(
    () => assertBundledProbe({ missingExternals: ['secp256k1'], missingEntries: [] }, packageJson, lock),
    /EXTERNAL packages missing/
  )
  assert.throws(
    () => assertBundledProbe({ missingExternals: [], missingEntries: ['index.js'] }, packageJson, lock),
    /main bundle entries missing/
  )
})
