import log from 'electron-log'

const LIST_URL = 'https://chainlist.org/rpcs.json'
const TIMEOUT_MS = 15_000
const MAX_RPCS = 5

interface ListedChain {
  chainId: number
  name: string
  nativeCurrency?: { name?: string; symbol?: string; decimals?: number }
  explorers?: { url?: string }[]
  isTestnet?: boolean
  rpc?: ({ url?: string; tracking?: string } | string)[]
}

export interface ChainLookup {
  id: number
  name: string
  symbol: string
  nativeCurrencyName: string
  nativeCurrencyDecimals: number
  explorer: string
  isTestnet: boolean
  rpcUrls: string[]
}

// The list is about 2.4 MB, so fetch it once per session.
let listing: Promise<ListedChain[]> | undefined

const loadList = () => {
  listing ??= fetch(LIST_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json() as Promise<ListedChain[]>
    })
    .catch((error) => {
      listing = undefined
      throw error
    })
  return listing
}

// Keep plain HTTPS endpoints only: no key placeholders, no credentials. Prefer endpoints that do not track.
const rpcUrls = (rpc: ListedChain['rpc'] = []) => {
  const rank = (tracking?: string) => (tracking === 'none' ? 0 : tracking === 'limited' ? 1 : 2)
  return rpc
    .map((entry) => (typeof entry === 'string' ? { url: entry } : entry))
    .filter((entry): entry is { url: string; tracking?: string } => {
      if (typeof entry.url !== 'string' || entry.url.includes('$')) return false
      try {
        const url = new URL(entry.url)
        return url.protocol === 'https:' && !url.username && !url.password && entry.url.length <= 2048
      } catch {
        return false
      }
    })
    .sort((a, b) => rank(a.tracking) - rank(b.tracking))
    .slice(0, MAX_RPCS)
    .map(({ url }) => url)
}

export async function lookupChain(chainId: number): Promise<ChainLookup | { error: string }> {
  let chains: ListedChain[]
  try {
    chains = await loadList()
  } catch (error) {
    log.warn('Could not load chain list', (error as Error).message)
    return { error: 'Couldn’t reach chainlist.org' }
  }

  const chain = Array.isArray(chains) ? chains.find((item) => item?.chainId === chainId) : undefined
  if (!chain) return { error: 'Chain ID not found on chainlist.org' }

  const urls = rpcUrls(chain.rpc)
  if (!urls.length) return { error: 'No public HTTPS RPC listed for this chain' }

  const currency = chain.nativeCurrency ?? {}
  const decimals = currency.decimals
  const explorer = chain.explorers
    ?.map(({ url }) => url)
    .find((url) => url?.startsWith('https://') && url.length <= 2048)
  return {
    id: chainId,
    name: String(chain.name ?? '').slice(0, 128),
    symbol: String(currency.symbol ?? '').slice(0, 32),
    nativeCurrencyName: String(currency.name ?? currency.symbol ?? '').slice(0, 128),
    nativeCurrencyDecimals: Number.isInteger(decimals) && decimals! >= 0 && decimals! <= 255 ? decimals! : 18,
    explorer: explorer ?? '',
    isTestnet: chain.isTestnet === true,
    rpcUrls: urls
  }
}

export const resetChainListCache = () => {
  listing = undefined
}
