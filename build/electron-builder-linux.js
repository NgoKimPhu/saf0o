const baseConfig = require('./electron-builder-base.js')

module.exports = {
  ...baseConfig,
  appImage: {
    // Saf0o requires Electron's renderer sandbox in production.
    executableArgs: []
  },
  linux: {
    category: 'Office;Finance',
    syncDesktopName: true,
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] }
    ]
  }
}
