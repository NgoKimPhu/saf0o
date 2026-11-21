import { createHash } from 'crypto'

import { fetchWithTimeout, readJsonWithLimit } from '../../resources/utils/fetch'
import type { Signal } from '../../resources/domain/reputation/level'
import { ETHERSCAN_V2_URL } from '../contractVerification/etherscan'
import { sanitizeName } from './sanitize'

const TIMEOUT_MS = 5000
const GAP_MS = 400 // free tier allows 3 calls/s
const RATE_BLOCK_MS = 10_000
const BAD_KEY_BLOCK_MS = 5 * 60_000
const MAX_ROWS = 1000
const SOURCE_CAP = 4 * 1024 * 1024
const CREATION_CAP = 2 * 1024 * 1024
const TXLIST_CAP = 2 * 1024 * 1024
const ADDRESS = /^0x[0-9a-f]{40}$/
const KEY = /^[A-Za-z0-9_-]{16,128}$/
const EMPTY = /no (data|transactions|records) found/i
const UNVERIFIED_ABI = 'Contract source code not verified'

export type TxRow = Readonly<{ from: string; to: string; timestamp: number }>
type Raw = Signal<unknown>

const fail = (
  reason: 'error' | 'rate-limit' | 'bad-key' | 'chain'
): { ok: false; reason: typeof reason } => ({
  ok: false,
  reason
})
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const digest = (key: string) => createHash('sha256').update(key).digest('hex')

function classify(text: string) {
  if (/rate limit/i.test(text)) return 'rate-limit' as const
  if (/invalid api key|too many invalid/i.test(text)) return 'bad-key' as const
  if (/chainid|not supported|upgrade/i.test(text)) return 'chain' as const
  return 'error' as const
}

export function createEtherscanReader(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  let nextStart = 0
  let rateBlockedUntil = 0
  let badKey: { digest: string; until: number } | undefined

  // Reserve the next start slot synchronously so concurrent callers queue in order.
  const gate = async () => {
    const start = Math.max(now(), nextStart)
    nextStart = start + GAP_MS
    if (start > now()) await sleep(start - now())
  }

  // Never put the URL or key in a thrown or logged message: every failure collapses to a reason.
  async function call(
    chainId: number,
    key: string,
    params: Record<string, string>,
    cap: number
  ): Promise<Raw> {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return fail('error')
    if (typeof key !== 'string' || !KEY.test(key)) return fail('bad-key')
    if (badKey && badKey.until > now() && badKey.digest === digest(key)) return fail('bad-key')
    if (rateBlockedUntil > now()) return fail('rate-limit')

    const url = new URL(ETHERSCAN_V2_URL)
    for (const [name, value] of Object.entries({ chainid: String(chainId), ...params, apikey: key })) {
      url.searchParams.set(name, value)
    }

    let body: unknown
    try {
      await gate()
      const response = await fetchWithTimeout(
        url.toString(),
        { redirect: 'error', headers: { accept: 'application/json' } },
        TIMEOUT_MS,
        fetchImpl
      )
      if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return fail('error')
      body = await readJsonWithLimit(response, cap)
    } catch {
      return fail('error')
    }

    if (
      !isRecord(body) ||
      typeof body['status'] !== 'string' ||
      typeof body['message'] !== 'string' ||
      !('result' in body)
    ) {
      return fail('error')
    }
    const result = body['result']
    if (body['status'] === '1') return { ok: true, value: result }
    if (
      (Array.isArray(result) && result.length === 0) ||
      (typeof result === 'string' && EMPTY.test(result)) ||
      EMPTY.test(body['message'])
    ) {
      return { ok: true, value: [] }
    }

    const reason = classify(`${body['message']} ${typeof result === 'string' ? result : ''}`)
    if (reason === 'rate-limit') rateBlockedUntil = now() + RATE_BLOCK_MS
    if (reason === 'bad-key') badKey = { digest: digest(key), until: now() + BAD_KEY_BLOCK_MS }
    return fail(reason)
  }

  const validAddress = (address: string) => typeof address === 'string' && ADDRESS.test(address)

  async function contractCreation(
    chainId: number,
    address: string,
    key: string
  ): Promise<Signal<{ isContract: false } | { isContract: true; createdAt: number }>> {
    if (!validAddress(address)) return fail('error')
    const raw = await call(
      chainId,
      key,
      { module: 'contract', action: 'getcontractcreation', contractaddresses: address },
      CREATION_CAP
    )
    if (!raw.ok) return raw
    if (!Array.isArray(raw.value) || raw.value.length > 5) return fail('error')
    if (raw.value.length === 0) return { ok: true, value: { isContract: false } }
    const row = raw.value.find(
      (r) =>
        isRecord(r) &&
        typeof r['contractAddress'] === 'string' &&
        r['contractAddress'].toLowerCase() === address
    )
    if (!row) return { ok: true, value: { isContract: false } }
    const createdAt = Number(row['timestamp'])
    if (!Number.isSafeInteger(createdAt) || createdAt <= 0) return fail('error')
    return { ok: true, value: { isContract: true, createdAt } }
  }

  async function sourceCode(
    chainId: number,
    address: string,
    key: string
  ): Promise<Signal<{ verified: boolean; name?: string; proxy: boolean }>> {
    if (!validAddress(address)) return fail('error')
    const raw = await call(chainId, key, { module: 'contract', action: 'getsourcecode', address }, SOURCE_CAP)
    if (!raw.ok) return raw
    const row = Array.isArray(raw.value) ? raw.value[0] : undefined
    if (!isRecord(row) || typeof row['ABI'] !== 'string') return fail('error')
    const verified = row['ABI'] !== UNVERIFIED_ABI
    const name = verified ? sanitizeName(row['ContractName']) : undefined
    return { ok: true, value: { verified, ...(name ? { name } : {}), proxy: row['Proxy'] === '1' } }
  }

  async function txList(
    chainId: number,
    address: string,
    key: string,
    { page, offset }: { page: number; offset: number }
  ): Promise<Signal<readonly TxRow[]>> {
    if (!validAddress(address)) return fail('error')
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(offset) ||
      offset < 1 ||
      offset > MAX_ROWS
    ) {
      return fail('error')
    }
    const raw = await call(
      chainId,
      key,
      {
        module: 'account',
        action: 'txlist',
        address,
        startblock: '0',
        endblock: '99999999',
        page: String(page),
        offset: String(offset),
        sort: 'desc'
      },
      TXLIST_CAP
    )
    if (!raw.ok) return raw
    if (!Array.isArray(raw.value) || raw.value.length > MAX_ROWS) return fail('error')
    const rows: TxRow[] = []
    for (const r of raw.value) {
      if (!isRecord(r) || typeof r['from'] !== 'string' || typeof r['to'] !== 'string') return fail('error')
      const from = r['from'].toLowerCase()
      const to = r['to'].toLowerCase()
      const timestamp = Number(r['timeStamp'])
      // `to` is empty for contract creations
      if (!ADDRESS.test(from) || (to !== '' && !ADDRESS.test(to)) || !Number.isSafeInteger(timestamp)) {
        return fail('error')
      }
      rows.push({ from, to, timestamp })
    }
    return { ok: true, value: rows }
  }

  return { contractCreation, sourceCode, txList }
}

export type EtherscanReader = ReturnType<typeof createEtherscanReader>
