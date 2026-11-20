const baseConfig = require('./electron-builder-base.js')
const { readMacSigningMode, readSigningMode } = require('./signing-mode.js')

const signingMode = readMacSigningMode('SAF0O_MAC_SIGNING')
const notarizationMode = readSigningMode('SAF0O_MAC_NOTARIZATION')

if ((signingMode === 'required') !== (notarizationMode === 'required')) {
  throw new Error('macOS Developer ID signing and notarization must both be required or both be skipped')
}

const preview = signingMode !== 'required'

module.exports = {
  ...baseConfig,
  artifactName: preview
    ? 'Saf0o-${version}-macos-${arch}-unnotarized.${ext}'
    : 'Saf0o-${version}-macos-${arch}.${ext}',
  afterSign: './build/notarize.js',
  forceCodeSigning: signingMode !== 'skip',
  mac: {
    target: { target: 'default', arch: [process.arch] },
    identity: signingMode === 'skip' ? null : signingMode === 'adhoc' ? '-' : undefined,
    notarize: false,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist'
  }
}
