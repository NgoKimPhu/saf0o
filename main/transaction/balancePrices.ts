import {
  DEFI_LLAMA_PRICE_URL,
  MAX_IDENTIFIERS_PER_REQUEST,
  MAX_PRICE_RESPONSE_BYTES
} from '../externalData/assets/provider'
import { fetchWithTimeout, readJsonWithLimit } from '../../resources/utils/fetch'

export type TrustedPrice = { price: number; confidence: number }

const IDENTIFIER_PATTERN = /^[a-z0-9-]+:0x[0-9a-f]{40}$/u
const REQUEST_TIMEOUT_MS = 5_000
const MIN_CONFIDENCE = 0.9
const MAX_AGE_S = 2 * 60 * 60
const HIT_TTL_MS = 60_000
const MISS_TTL_MS = 30_000
const MAX_CACHE = 200

// A marker with no price caches "no trusted price" so block-driven re-sims do not refetch.
const cache = new Map<string, { price?: TrustedPrice; expires: number }>()

export function clearTrustedPriceCache() {
  cache.clear()
}

const remember = (id: string, price: TrustedPrice | undefined, now: number) => {
  cache.delete(id)
  cache.set(id, { price, expires: now + (price ? HIT_TTL_MS : MISS_TTL_MS) })
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
}

const trusted = (quote: unknown, nowS: number): TrustedPrice | undefined => {
  if (!quote || typeof quote !== 'object') return
  const { price, confidence, timestamp } = quote as Record<string, unknown>
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || Math.abs(nowS - timestamp) > MAX_AGE_S)
    return
  return { price, confidence }
}

// Prices a scam token cannot easily fake: DefiLlama only, with confidence and freshness checks.
export async function loadLlamaCurrent(
  ids: string[],
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<Record<string, TrustedPrice>> {
  const result: Record<string, TrustedPrice> = {}
  const wanted = [...new Set(ids)]
    .filter((id) => IDENTIFIER_PATTERN.test(id))
    .slice(0, MAX_IDENTIFIERS_PER_REQUEST)
  const missing: string[] = []

  for (const id of wanted) {
    const hit = cache.get(id)
    if (hit && hit.expires > now()) {
      if (hit.price) result[id] = hit.price
    } else missing.push(id)
  }
  if (!missing.length) return result

  let coins: Record<string, unknown> = {}
  try {
    const response = await fetchWithTimeout(
      `${DEFI_LLAMA_PRICE_URL}/prices/current/${missing.join(',')}`,
      { headers: { accept: 'application/json' }, redirect: 'error' },
      REQUEST_TIMEOUT_MS,
      fetchImpl
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await readJsonWithLimit<{ coins?: Record<string, unknown> }>(
      response,
      MAX_PRICE_RESPONSE_BYTES
    )
    if (payload?.coins && typeof payload.coins === 'object') coins = payload.coins
  } catch {
    for (const id of missing) remember(id, undefined, now())
    return result
  }

  for (const id of missing) {
    const price = trusted(coins[id], now() / 1000)
    remember(id, price, now())
    if (price) result[id] = price
  }
  return result
}
