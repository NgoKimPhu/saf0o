import log from 'electron-log'

import { fetchWithTimeout, readJsonWithLimit } from '../../resources/utils/fetch'
import type { Signal } from '../../resources/domain/reputation/level'
import { sanitizeName } from './sanitize'

// The ONLY place the extension impersonation lives. If BlockSec changes the gate, edit this one constant.
export const METASLEUTH_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:161.0) Gecko/20100101 Firefox/161.0',
  accept: '*/*',
  'content-type': 'application/json',
  'blocksec-meta-dock': 'v5.13.4',
  origin: 'moz-extension://00000000-0000-4000-8000-000000000000', // any uuid is accepted (live test)
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site'
} as const

export const METASLEUTH_CHAIN_SLUGS: Readonly<Record<number, string>> = {
  1: 'eth',
  10: 'optimism',
  56: 'bsc',
  100: 'gnosis',
  137: 'polygon',
  4663: 'robinhood',
  8453: 'base',
  42161: 'arbitrum',
  42170: 'nova.arbitrum',
  43114: 'avalanche',
  59144: 'linea',
  11155111: 'sepolia.eth'
}

const BASE = 'https://extension.blocksec.com/api/v1/'
const TIMEOUT_MS = 5000
const MAX_BYTES = 256 * 1024
const BLOCK_MS = 10 * 60_000
const MAX_ADDRESSES = 5
const ADDRESS = /^0x[0-9a-f]{40}$/

type Score = 0 | 1 | 2 | 3 | 4 | 5
const fail = (
  reason: 'error' | 'chain' | 'blocked' | 'rate-limit'
): { ok: false; reason: typeof reason } => ({
  ok: false,
  reason
})
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function createMetasleuthReader(fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let blocked: { until: number; reason: 'blocked' | 'rate-limit' } | undefined

  async function post(
    chainId: number,
    path: string,
    payload: Record<string, unknown>
  ): Promise<Signal<unknown>> {
    const slug = METASLEUTH_CHAIN_SLUGS[chainId]
    if (!slug) return fail('chain')
    if (blocked && blocked.until > now()) return fail(blocked.reason)

    try {
      const response = await fetchWithTimeout(
        `${BASE}${path}`,
        {
          method: 'POST',
          headers: METASLEUTH_HEADERS,
          body: JSON.stringify({ chain: slug, ...payload }),
          redirect: 'error'
        },
        TIMEOUT_MS,
        fetchImpl
      )
      if (response.status === 403 || response.status === 429) {
        await response.body?.cancel()
        const reason = response.status === 403 ? 'blocked' : 'rate-limit'
        blocked = { until: now() + BLOCK_MS, reason }
        if (reason === 'blocked') log.warn('metasleuth blocked')
        return fail(reason)
      }
      if (!response.ok) return fail('error')
      return { ok: true, value: await readJsonWithLimit<unknown>(response, MAX_BYTES) }
    } catch {
      return fail('error')
    }
  }

  // Unlabeled addresses are absent from the map. `logo` is ignored: no remote images are rendered.
  async function addressLabels(
    chainId: number,
    addresses: readonly string[]
  ): Promise<Signal<ReadonlyMap<string, string>>> {
    if (
      addresses.length === 0 ||
      addresses.length > MAX_ADDRESSES ||
      !addresses.every((a) => typeof a === 'string' && ADDRESS.test(a))
    ) {
      return fail('error')
    }
    const raw = await post(chainId, 'address-label', { addresses })
    if (!raw.ok) return raw
    if (!Array.isArray(raw.value) || raw.value.length > MAX_ADDRESSES * 2) return fail('error')
    const labels = new Map<string, string>()
    for (const item of raw.value) {
      if (!isRecord(item) || typeof item['address'] !== 'string') return fail('error')
      const address = item['address'].toLowerCase()
      if (!addresses.includes(address)) return fail('error')
      const label = item['label']
      if (label === undefined || label === null || label === '') continue
      if (typeof label !== 'string') return fail('error')
      const name = sanitizeName(label)
      if (name) labels.set(address, name)
    }
    return { ok: true, value: labels }
  }

  // The label call reports risk 0 even for Lazarus, so this call alone is authoritative.
  async function riskScore(chainId: number, address: string): Promise<Signal<{ score: Score }>> {
    if (typeof address !== 'string' || !ADDRESS.test(address)) return fail('error')
    const raw = await post(chainId, 'address-risk-score', { address })
    if (!raw.ok) return raw
    if (!isRecord(raw.value) || typeof raw.value['address'] !== 'string') return fail('error')
    const score = raw.value['risk']
    if (raw.value['address'].toLowerCase() !== address) return fail('error')
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 5) return fail('error')
    return { ok: true, value: { score: score as Score } }
  }

  return { addressLabels, riskScore }
}

export type MetasleuthReader = ReturnType<typeof createMetasleuthReader>
