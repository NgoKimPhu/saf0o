import BigNumber from 'bignumber.js'

export type NetChange = Readonly<{
  asset: 'native' | string
  standard: 'native' | 'erc20' | 'erc721' | 'erc1155'
  delta: string
}>

export type PricedChange = Readonly<NetChange & { usd?: number | undefined }>

export type EffectLike = Readonly<{
  type: string
  standard?: string
  token?: string
  from?: string
  to?: string
  amount?: string
  tokenId?: string
}>

const SWAP_LOSS_THRESHOLD = 0.95
const ORDER = { native: 0, erc20: 1, erc721: 2, erc1155: 2 } as const

const toBigInt = (value?: string) => {
  try {
    return value === undefined ? undefined : BigInt(value)
  } catch {
    return undefined
  }
}

// Net signed change per asset for one account. Zero nets are dropped.
export function netBalanceChanges(input: {
  account: string
  effects: readonly EffectLike[]
  nativeChange?: string | undefined
  fallbackNativeOut?: string | undefined
}): NetChange[] {
  const account = input.account.toLowerCase()
  const sums = new Map<string, { standard: NetChange['standard']; delta: bigint }>()
  const add = (asset: string, standard: NetChange['standard'], delta: bigint) => {
    const entry = sums.get(asset) || { standard, delta: 0n }
    entry.delta += delta
    sums.set(asset, entry)
  }

  const native = toBigInt(input.nativeChange)
  const fallback = toBigInt(input.fallbackNativeOut)
  if (native !== undefined) add('native', 'native', native)
  else if (fallback !== undefined) add('native', 'native', -fallback)

  for (const effect of input.effects) {
    if (effect.type !== 'transfer' || !effect.token) continue
    const standard = effect.standard
    if (standard !== 'erc20' && standard !== 'erc721' && standard !== 'erc1155') continue
    const amount = standard === 'erc721' ? 1n : toBigInt(effect.amount)
    if (amount === undefined) continue
    const incoming = effect.to?.toLowerCase() === account
    const outgoing = effect.from?.toLowerCase() === account
    if (incoming === outgoing) continue
    add(effect.token.toLowerCase(), standard, incoming ? amount : -amount)
  }

  return [...sums]
    .filter(([, { delta }]) => delta !== 0n)
    .map(([asset, { standard, delta }]) => ({ asset, standard, delta: delta.toString() }) as NetChange)
    .sort((a, b) => ORDER[a.standard] - ORDER[b.standard])
}

export function usdOf(delta: string, decimals: number, price: number): number {
  return new BigNumber(delta).shiftedBy(-decimals).times(price).toNumber()
}

const isFungible = (change: PricedChange) => change.standard === 'native' || change.standard === 'erc20'

export function summarizeBalancePreview(changes: readonly PricedChange[]): {
  totalUsd?: number | undefined
  unpricedFungible: number
  swapLoss?: { sentUsd: number; receivedUsd: number; lossPct: number }
} {
  const priced = changes.filter((change) => change.usd !== undefined)
  const fungible = changes.filter(isFungible)
  const unpricedFungible = fungible.filter((change) => change.usd === undefined).length
  const totalUsd = priced.length ? priced.reduce((sum, change) => sum + (change.usd as number), 0) : undefined

  let swapLoss: { sentUsd: number; receivedUsd: number; lossPct: number } | undefined
  if (fungible.length && !unpricedFungible) {
    const out = fungible.filter((change) => (change.usd as number) < 0)
    const incoming = fungible.filter((change) => (change.usd as number) > 0)
    const sentUsd = -out.reduce((sum, change) => sum + (change.usd as number), 0)
    const receivedUsd = incoming.reduce((sum, change) => sum + (change.usd as number), 0)
    if (out.length && incoming.length && receivedUsd < sentUsd * SWAP_LOSS_THRESHOLD)
      swapLoss = { sentUsd, receivedUsd, lossPct: (1 - receivedUsd / sentUsd) * 100 }
  }

  return { totalUsd, unpricedFungible, ...(swapLoss ? { swapLoss } : {}) }
}
