const baseConfig = require('./electron-builder-base.js')
const { mainBundleFiles } = require('./main-bundle.js')
const { readSigningMode } = require('./signing-mode.js')

const signingMode = readSigningMode('SAF0O_WINDOWS_SIGNING')

module.exports = {
  ...baseConfig,
  files: mainBundleFiles(),
  artifactName:
    signingMode === 'required'
      ? 'Saf0o-Setup-${version}-x64.${ext}'
      : 'Saf0o-Setup-${version}-unsigned-x64.${ext}',
  forceCodeSigning: signingMode === 'required',
  win: {
    signAndEditExecutable: true,
    signExecutable: signingMode === 'required',
    icon: 'build/icons/icon.png',
    target: [{ target: 'nsis', arch: ['x64'] }]
  }
}
