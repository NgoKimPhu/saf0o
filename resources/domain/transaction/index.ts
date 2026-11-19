import type { JSONTx } from '@ethereumjs/tx'
export { normalizeTransactionChainId as normalizeChainId } from '../request/transaction'

export enum GasFeesSource {
  Dapp = 'Dapp',
  Frame = 'Frame'
}

// @ethereumjs/tx 10 types JSONTx fields as 0x-prefixed template strings; Wren carries plain strings.
type LooseHex<T> = { [K in keyof T]: T[K] extends `0x${string}` | undefined ? string : T[K] }

export interface TransactionData extends Omit<LooseHex<JSONTx>, 'chainId' | 'type'> {
  warning?: string
  gas?: string
  from?: string
  feesUpdated?: boolean
  chainId: string
  type: string
  gasFeesSource: GasFeesSource
  recipientType?: string
}

export function typeSupportsBaseFee(type: string) {
  return parseInt(type || '0') === 2
}

export function usesBaseFee(rawTx: TransactionData) {
  return typeSupportsBaseFee(rawTx.type)
}
