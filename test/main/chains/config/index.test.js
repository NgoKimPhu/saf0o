import chainConfig from '../../../../main/chains/config'
import { feeHistoryPolicy, supportsFeeHistory } from '../../../../main/chains/policy'

describe('polygon', () => {
  it('sets the chain id', () => {
    const config = chainConfig(137)

    expect(config.chainId()).toBe(BigInt(137))
  })

  it('sets EIP-1559 to be disabled by default', () => {
    const config = chainConfig(137, 'istanbul')

    expect(config.gteHardfork('london')).toBe(false)
  })
})

describe('chain execution policy', () => {
  it.each([250, 4002])('keeps chain %s on legacy fee sampling', (chainId) => {
    expect(supportsFeeHistory(chainId)).toBe(false)
  })

  // A legacy-fee chain builds type-0 txs, so the EIP-7702 upgrade (type 4) cannot be built there.
  it('samples EIP-1559 fees on Arbitrum so account upgrades can be built', () => {
    expect(supportsFeeHistory(42161)).toBe(true)
  })

  it.each([
    [1, 'default'],
    [137, 'polygon'],
    [10, 'op-stack'],
    [8453, 'op-stack']
  ])('selects fee policy for chain %s', (chainId, expected) => {
    expect(feeHistoryPolicy(chainId)).toBe(expected)
  })
})
