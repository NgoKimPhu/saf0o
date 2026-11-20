const load = (path, env = {}) => {
  jest.resetModules()
  const names = ['SAF0O_MAC_SIGNING', 'SAF0O_MAC_NOTARIZATION', 'SAF0O_WINDOWS_SIGNING']
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  names.forEach((name) => delete process.env[name])
  Object.assign(process.env, env)
  try {
    return require(path)
  } finally {
    names.forEach((name) => {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    })
  }
}

describe('electron-builder platform boundaries', () => {
  test('makes unsigned macOS output explicit and removes inherited identities', () => {
    const config = load('../../../build/electron-builder-macos.js', {
      SAF0O_MAC_SIGNING: 'skip',
      SAF0O_MAC_NOTARIZATION: 'skip'
    })
    expect(config.forceCodeSigning).toBe(false)
    expect(config.mac.identity).toBeNull()
    expect(config.mac.requirements).toBeUndefined()
  })

  test('makes the privacy-preserving macOS preview explicitly ad-hoc and unnotarized', () => {
    const config = load('../../../build/electron-builder-macos.js', {
      SAF0O_MAC_SIGNING: 'adhoc',
      SAF0O_MAC_NOTARIZATION: 'skip'
    })
    expect(config.forceCodeSigning).toBe(true)
    expect(config.mac.identity).toBe('-')
    expect(config.artifactName).toBe('Saf0o-${version}-macos-${arch}-unnotarized.${ext}')
  })

  test('makes macOS release signing fail closed', () => {
    const config = load('../../../build/electron-builder-macos.js', {
      SAF0O_MAC_SIGNING: 'required',
      SAF0O_MAC_NOTARIZATION: 'required'
    })
    expect(config.forceCodeSigning).toBe(true)
    expect(config.mac.identity).toBeUndefined()
    expect(config.mac.target.arch).toEqual([process.arch])
    expect(() => load('../../../build/electron-builder-macos.js')).toThrow(
      'SAF0O_MAC_SIGNING must be explicitly set'
    )
    expect(() =>
      load('../../../build/electron-builder-macos.js', {
        SAF0O_MAC_SIGNING: 'required',
        SAF0O_MAC_NOTARIZATION: 'skip'
      })
    ).toThrow('macOS Developer ID signing and notarization must both be required or both be skipped')
    expect(() =>
      load('../../../build/electron-builder-macos.js', {
        SAF0O_MAC_SIGNING: 'adhoc',
        SAF0O_MAC_NOTARIZATION: 'required'
      })
    ).toThrow('macOS Developer ID signing and notarization must both be required or both be skipped')
  })

  test('distinguishes unsigned and fail-closed Windows output', () => {
    const unsigned = load('../../../build/electron-builder-windows.js', {
      SAF0O_WINDOWS_SIGNING: 'skip'
    })
    expect(unsigned.forceCodeSigning).toBe(false)
    expect(unsigned.win.signExecutable).toBe(false)
    expect(unsigned.artifactName).toBe('Saf0o-Setup-${version}-unsigned-x64.${ext}')

    const signed = load('../../../build/electron-builder-windows.js', {
      SAF0O_WINDOWS_SIGNING: 'required'
    })
    expect(signed.forceCodeSigning).toBe(true)
    expect(signed.win.signExecutable).toBe(true)
    expect(signed.artifactName).toBe('Saf0o-Setup-${version}-x64.${ext}')
  })
})
