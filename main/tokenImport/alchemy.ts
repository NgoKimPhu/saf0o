// One-time token discovery through Alchemy's Portfolio API (tokens by wallet).
// The API key sits in the URL path: never log the URL or the key.

export type ImportCandidate = {
  chainId: number
  address: string
  name: string
  symbol: string
  decimals: number
  balance: string
  // Value in USD from Alchemy's price. Absent when Alchemy has no price.
  usdValue?: number
}

export type DiscoveryResult = {
  candidates: ImportCandidate[]
  // Chains Alchemy did not answer for (unsupported slug, upstream error, or a failed request).
  failedChainIds: number[]
  // More tokens exist than the list holds (token cap or page cap reached).
  truncated: boolean
}

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<{ status: number; json(): Promise<unknown> }>

// Alchemy network slugs by chain id. A wrong slug only fails that chain (reported in failedChainIds).
export const ALCHEMY_NETWORKS: Readonly<Record<number, string>> = {
  1: 'eth-mainnet',
  10: 'opt-mainnet',
  56: 'bnb-mainnet',
  100: 'gnosis-mainnet',
  137: 'matic-mainnet',
  8453: 'base-mainnet',
  42161: 'arb-mainnet',
  43114: 'avax-mainnet',
  59144: 'linea-mainnet'
}

const ENDPOINT = 'https://api.g.alchemy.com/data/v1'
const NETWORKS_PER_REQUEST = 5
const MAX_PAGES = 10
const MAX_TOKENS = 1000
const REQUEST_TIMEOUT_MS = 20_000
const MAX_NAME = 64
const MAX_SYMBOL = 24
const MAX_DECIMALS = 36

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Name and symbol come from the token contract, so an airdrop scam controls them. Strip control and
// bidi characters and cap the length.
const cleanText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/[\p{C}\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, '')
    .trim()
    .slice(0, max)
  return text || undefined
}

const parseBalance = (value: unknown) => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return undefined
  const balance = BigInt(value)
  return balance > 0n ? balance.toString() : undefined
}

// Returns undefined for entries to drop: native tokens, zero balances, bad addresses or metadata.
export const toCandidate = (entry: unknown, chainIdBySlug: ReadonlyMap<string, number>) => {
  if (!isRecord(entry) || typeof entry['network'] !== 'string') return undefined
  const chainId = chainIdBySlug.get(entry['network'])
  const address = typeof entry['tokenAddress'] === 'string' ? entry['tokenAddress'].toLowerCase() : undefined
  const balance = parseBalance(entry['tokenBalance'])
  if (!chainId || !address || !/^0x[0-9a-f]{40}$/.test(address) || !balance) return undefined

  const meta = isRecord(entry['tokenMetadata']) ? entry['tokenMetadata'] : {}
  const decimals = meta['decimals']
  const symbol = cleanText(meta['symbol'], MAX_SYMBOL)
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS)
    return
  if (!symbol) return

  const name = cleanText(meta['name'], MAX_NAME) ?? symbol
  const usdValue = toUsdValue(entry['tokenPrices'], balance, decimals)
  return {
    chainId,
    address,
    name,
    symbol,
    decimals,
    balance,
    ...(usdValue === undefined ? {} : { usdValue })
  }
}

// Display-only estimate: float math is fine here.
const toUsdValue = (prices: unknown, balance: string, decimals: number) => {
  const usd = Array.isArray(prices) ? prices.find((p) => isRecord(p) && p['currency'] === 'usd') : undefined
  const price = isRecord(usd) ? Number(usd['value']) : NaN
  const value = (Number(balance) / 10 ** decimals) * price
  return Number.isFinite(value) ? value : undefined
}

export async function discoverTokens(
  apiKey: string,
  account: string,
  chainIds: readonly number[],
  fetchImpl: Fetch = fetch as unknown as Fetch
): Promise<DiscoveryResult> {
  const chainIdBySlug = new Map(chainIds.map((id) => [ALCHEMY_NETWORKS[id] as string, id]))
  const slugs = [...chainIdBySlug.keys()]
  const candidates = new Map<string, ImportCandidate>()
  const failed = new Set<string>()
  let truncated = false

  for (let i = 0; i < slugs.length; i += NETWORKS_PER_REQUEST) {
    const chunk = slugs.slice(i, i + NETWORKS_PER_REQUEST)
    let pageKey: string | undefined
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await fetchImpl(`${ENDPOINT}/${apiKey}/assets/tokens/by-address`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            addresses: [{ address: account, networks: chunk }],
            withMetadata: true,
            withPrices: true,
            includeNativeTokens: false,
            includeErc20Tokens: true,
            ...(pageKey ? { pageKey } : {})
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
        const body = response.status === 200 ? await response.json() : undefined
        const data = isRecord(body) && isRecord(body['data']) ? body['data'] : undefined
        if (!data || !Array.isArray(data['tokens'])) throw new Error('unexpected response')

        const errors = isRecord(body) && isRecord(body['error']) ? body['error']['partialErrors'] : undefined
        if (Array.isArray(errors)) {
          for (const e of errors)
            if (isRecord(e) && typeof e['network'] === 'string') failed.add(e['network'])
        }
        for (const entry of data['tokens']) {
          const candidate = toCandidate(entry, chainIdBySlug)
          if (candidate) candidates.set(`${candidate.chainId}:${candidate.address}`, candidate)
        }
        pageKey = typeof data['pageKey'] === 'string' && data['pageKey'] ? data['pageKey'] : undefined
        if (!pageKey) break
        if (candidates.size >= MAX_TOKENS || page === MAX_PAGES - 1) {
          truncated = true
          break
        }
      }
    } catch {
      // Timeout, bad status or malformed body: report the whole chunk as failed. Keep earlier pages.
      for (const slug of chunk) failed.add(slug)
    }
  }

  return {
    candidates: [...candidates.values()].slice(0, MAX_TOKENS),
    truncated: truncated || candidates.size > MAX_TOKENS,
    failedChainIds: [...failed].flatMap((slug) => chainIdBySlug.get(slug) ?? [])
  }
}
