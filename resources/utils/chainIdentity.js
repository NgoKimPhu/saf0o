const chainFamilies = Object.freeze({
  1: 'ethereum',
  10: 'optimism',
  100: 'gnosis',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  84532: 'base',
  747474: 'katana',
  11155111: 'ethereum',
  11155420: 'optimism'
})

const identities = Object.freeze({
  ethereum: Object.freeze({ colorToken: '--saf0o-chain-ethereum', mark: 'ethereum' }),
  optimism: Object.freeze({ colorToken: '--saf0o-chain-optimism', mark: 'optimism' }),
  gnosis: Object.freeze({ colorToken: '--saf0o-chain-gnosis', mark: 'gnosis' }),
  polygon: Object.freeze({ colorToken: '--saf0o-chain-polygon', mark: 'polygon' }),
  base: Object.freeze({ colorToken: '--saf0o-chain-base', mark: 'base' }),
  arbitrum: Object.freeze({ colorToken: '--saf0o-chain-arbitrum', mark: 'arbitrum' }),
  katana: Object.freeze({ colorToken: '--saf0o-chain-katana', mark: 'katana' }),
  custom: Object.freeze({ colorToken: '--saf0o-chain-custom', mark: 'chain' })
})

export function getChainIdentity(chainId, isTestnet = false) {
  const family = chainFamilies[Number(chainId)] || 'custom'
  const identity = identities[family]

  return isTestnet ? { ...identity, colorToken: '--saf0o-chain-testnet' } : identity
}
