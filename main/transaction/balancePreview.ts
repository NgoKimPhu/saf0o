import log from 'electron-log'
import { createHash } from 'crypto'
import reveal from '../reveal'
import store from '../store'
import { hasSimulationEffects } from '../../resources/domain/transaction/effects'
import { parseRpcQuantity } from '../../resources/domain/transaction/quantity'
import {
  netBalanceChanges,
  usdOf,
  type EffectLike,
  type NetChange
} from '../../resources/domain/transaction/balanceChanges'
import { tokenIdentifier } from '../externalData/assets'
import { loadLlamaCurrent, type TrustedPrice } from './balancePrices'
import type { TransactionRequest, WalletCallsRequest } from '../accounts/types'
import type { Balance, Token } from '../store/state'

export type BalancePreviewChange = Readonly<NetChange & { usd?: number | undefined }>
export type BalancePreviewToken = Readonly<{
  symbol?: string | undefined
  decimals?: number | undefined
  known: boolean
}>
export type BalancePreview = Readonly<{
  key: string
  assessedAt: number
  changes: readonly BalancePreviewChange[]
  tokens: Readonly<Record<string, BalancePreviewToken>>
  enriched: boolean
  // Why native (ETH) changes are missing, when the trace behind them did not run.
  nativeNote?: string | undefined
}>

export interface Deps {
  fetch?: typeof fetch
  now: () => number
  balances: (account: string) => Balance[]
  nativeUsd: (chainId: number) => number | undefined
  metadata: (
    chainId: number,
    tokens: string[]
  ) => Promise<{ tokens: ReadonlyArray<{ address: string; symbol?: string; decimals?: number }> }>
  timeoutMs: number
}

const MAX_METADATA_TOKENS = 8
const ENRICH_TIMEOUT_MS = 6_000
// Robinhood (4663) prices come from pool quotes upstream, which are not trustworthy.
const UNPRICED_CHAINS = new Set([4663])

const defaultDeps: Deps = {
  now: Date.now,
  balances: (account) => (store('main.balances', account) || []) as Balance[],
  nativeUsd: (chainId) => {
    const price = store('main.networksMeta.ethereum', chainId, 'nativeCurrency', 'usd', 'price')
    return typeof price === 'number' && price > 0 ? price : undefined
  },
  metadata: (chainId, tokens) => reveal.signingMetadata(chainId, { tokens }),
  timeoutMs: ENRICH_TIMEOUT_MS
}

// Key last computed per request. Never cleared on failure, so a failed key is not retried on every re-simulation.
const computed = new WeakMap<object, string>()

const nativeIn = (req: TransactionRequest | WalletCallsRequest) => {
  const account = req.account?.toLowerCase()
  if (req.type === 'transaction') {
    const simulation = req.simulation
    const effects = hasSimulationEffects(simulation) ? ((simulation.effects || []) as EffectLike[]) : []
    const traced =
      simulation.nativeBalanceChanges?.status === 'succeeded'
        ? simulation.nativeBalanceChanges.changes.find((c) => c.account?.toLowerCase() === account)?.change
        : undefined
    const nativeChange = traced && traced !== '0' ? traced : undefined
    const value = parseRpcQuantity(req.data.value)
    const fallbackNativeOut =
      nativeChange === undefined && req.classification !== 'NATIVE_TRANSFER' && value
        ? value.toString()
        : undefined
    const traceEvidence = simulation.nativeBalanceChanges
    const nativeNote =
      traceEvidence && traceEvidence.status !== 'succeeded' ? traceEvidence.reason : undefined
    return {
      status: simulation.status,
      effects,
      nativeChange,
      fallbackNativeOut,
      nativeNote,
      chainId: req.data.chainId
    }
  }
  const simulation = req.simulation
  const effects = simulation.calls.flatMap((call) => (call.effects || []) as EffectLike[])
  const value = req.calls.reduce((sum, call) => sum + (parseRpcQuantity(call.value) ?? 0n), 0n)
  return {
    status: simulation.status,
    effects,
    nativeChange: undefined,
    fallbackNativeOut: value ? value.toString() : undefined,
    nativeNote: undefined,
    chainId: req.chainId
  }
}

const effectTokens = (effects: readonly EffectLike[]) => [
  ...new Set(effects.flatMap((e) => (typeof e.token === 'string' ? [e.token.toLowerCase()] : [])))
]

export function syncBalancePreview(
  req: TransactionRequest | WalletCallsRequest,
  d: { publish: () => void; isCurrent: () => boolean; deps?: Partial<Deps> }
): void {
  const deps = { ...defaultDeps, ...d.deps }
  const evidence = nativeIn(req)
  const chainId = Number(parseRpcQuantity(evidence.chainId))
  const changes =
    evidence.status === 'succeeded'
      ? netBalanceChanges({
          account: req.account,
          effects: evidence.effects,
          nativeChange: evidence.nativeChange,
          fallbackNativeOut: evidence.fallbackNativeOut
        })
      : []
  if (!changes.length || !Number.isSafeInteger(chainId) || chainId <= 0) {
    delete req.balancePreview
    computed.delete(req)
    return
  }

  const key = createHash('sha1')
    .update(
      JSON.stringify({
        account: req.account.toLowerCase(),
        chainId,
        effects: evidence.effects,
        native: evidence.nativeChange,
        fallback: evidence.fallbackNativeOut,
        note: evidence.nativeNote
      })
    )
    .digest('hex')
  if (req.balancePreview?.key === key && (req.balancePreview.enriched || computed.get(req) === key)) return

  computed.set(req, key)
  const tokens: Record<string, BalancePreviewToken> = {}
  for (const balance of deps.balances(req.account)) {
    const address = balance.address?.toLowerCase()
    if (balance.chainId === chainId && address)
      tokens[address] = { symbol: balance.symbol, decimals: balance.decimals, known: true }
  }
  const note = evidence.nativeNote ? { nativeNote: evidence.nativeNote } : {}
  const raw: BalancePreview = { key, assessedAt: deps.now(), changes, tokens, enriched: false, ...note }
  req.balancePreview = raw

  const erc20 = changes.filter((c) => c.standard === 'erc20')
  const native = changes.find((c) => c.standard === 'native')
  if (!erc20.length && !native) return

  const enrich = async (): Promise<BalancePreview> => {
    const merged: Record<string, BalancePreviewToken> = { ...tokens }
    const unknown = effectTokens(evidence.effects)
      .filter((address) => !tokens[address])
      .slice(0, MAX_METADATA_TOKENS)
    const nativePrice = native ? deps.nativeUsd(chainId) : undefined
    const priced = (UNPRICED_CHAINS.has(chainId) ? [] : erc20)
      .map((c) => ({ asset: c.asset, id: tokenIdentifier({ chainId, address: c.asset } as Token) }))
      .filter((p): p is { asset: string; id: string } => !!p.id)
    const [metadata, prices] = await Promise.all([
      unknown.length ? deps.metadata(chainId, unknown) : { tokens: [] },
      priced.length
        ? loadLlamaCurrent(
            priced.map((p) => p.id),
            deps.fetch,
            deps.now
          )
        : ({} as Record<string, TrustedPrice>)
    ])
    for (const m of metadata.tokens)
      merged[m.address.toLowerCase()] = {
        symbol: m.symbol || undefined,
        decimals: m.decimals,
        known: false
      }
    const idOf: Record<string, string> = Object.fromEntries(priced.map((p) => [p.asset, p.id]))
    const enriched = changes.map((c): BalancePreviewChange => {
      if (c.standard === 'native') return nativePrice ? { ...c, usd: usdOf(c.delta, 18, nativePrice) } : c
      const decimals = merged[c.asset]?.decimals
      const id = idOf[c.asset]
      const price = id ? prices[id] : undefined
      return c.standard === 'erc20' && decimals !== undefined && price
        ? { ...c, usd: usdOf(c.delta, decimals, price.price) }
        : c
    })
    return { key, assessedAt: deps.now(), changes: enriched, tokens: merged, enriched: true, ...note }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), deps.timeoutMs)
  })
  Promise.race([enrich(), timeout])
    .then((preview) => {
      if (!d.isCurrent() || computed.get(req) !== key) return
      req.balancePreview = preview
      d.publish()
    })
    .catch(() => log.warn('balance preview enrichment unavailable'))
    .finally(() => clearTimeout(timer))
}
