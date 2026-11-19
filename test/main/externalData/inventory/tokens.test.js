import TokenLoader from '../../../../main/externalData/inventory/tokens'

let tokenLoader

beforeEach(() => {
  tokenLoader = new TokenLoader()
})

describe('loading tokens', () => {
  it('fails to load tokens for an unknown chain', () => {
    const tokens = tokenLoader.getTokens([-1])

    expect(tokens.length).toBe(0)
  })
})

describe('#getBlacklist', () => {
  beforeEach(() => {
    tokenLoader = new TokenLoader([
      { name: 'Optimism', chainId: 10, address: '0x9999', extensions: { omit: true } },
      { name: 'Polygon', chainId: 137, address: '0x9999' },
      { name: 'Minereum', chainId: 137, address: '0x9999', extensions: { omit: true } }
    ])
  })

  it('returns all blacklisted tokens', () => {
    const blacklistedTokens = tokenLoader.getBlacklist().map((t) => t.name)

    expect(blacklistedTokens).toStrictEqual(['Optimism', 'Minereum'])
  })

  it('returns blacklisted tokens from a specific chain', () => {
    const blacklistedTokens = tokenLoader.getBlacklist([137]).map((t) => t.name)

    expect(blacklistedTokens).toStrictEqual(['Minereum'])
  })
})

describe('spoofed tokens in the default list', () => {
  const spoofed = [
    [1, '0x88c7385a403008b63dc028ba5acbad3edb1d1fa9'], // fake WBTC
    [1, '0xdfe66b14d37c77f4e9b180ceb433d1b164f0281d'], // fake stETH
    [59144, '0x6807857ab19c24e1a8f4b73453c477e1b59a5854'] // homoglyph LINEA
  ]

  it.each(spoofed)('omits %s %s from balance scanning', (chainId, address) => {
    const listed = (t) => t.chainId === chainId && t.address.toLowerCase() === address
    expect(tokenLoader.getTokens([chainId]).some(listed)).toBe(false)
    expect(tokenLoader.getBlacklist([chainId]).some(listed)).toBe(true)
  })
})
