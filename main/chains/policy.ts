import { chainUsesOptimismFees } from '../../resources/utils/chains'

// Arbitrum left this list: its zero priority fee no longer needs legacy txs, and an EIP-7702
// upgrade (type 4) needs EIP-1559 fees.
const LEGACY_FEE_CHAIN_IDS = new Set([250, 4002])

export type FeeHistoryPolicy = 'default' | 'polygon' | 'op-stack'

export function supportsFeeHistory(chainId: string | number) {
  return !LEGACY_FEE_CHAIN_IDS.has(Number(chainId))
}

export function feeHistoryPolicy(chainId: string | number): FeeHistoryPolicy {
  const id = Number(chainId)
  if (id === 137) return 'polygon'
  if (chainUsesOptimismFees(id)) return 'op-stack'
  return 'default'
}
