import log from 'electron-log'
import store from '../store'
import type { Chain } from '../chains'

type Send = (payload: JSONRPCRequestPayload, callback: RPCRequestCallback, targetChain: Chain) => void

// dRPC network names by chain id. Simulation needs debug_traceCall, which most public RPCs lack.
const DRPC_NETWORKS: Readonly<Record<number, string>> = {
  1: 'ethereum',
  56: 'bsc',
  143: 'monad-mainnet',
  8453: 'base',
  4663: 'robinhood',
  42161: 'arbitrum'
}

const REQUEST_TIMEOUT_MS = 20_000
// dRPC answers code 10 once a key's balance is used up, and 429 under load.
const EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000

const cooldownUntil = new Map<string, number>()
let cursor = 0

export const resetSimulationRpcState = () => {
  cooldownUntil.clear()
  cursor = 0
}

// Keys to try, in round-robin order. Cooling keys are skipped. No stored keys, or every key cooling,
// falls back to the public endpoint (undefined).
const candidates = (): (string | undefined)[] => {
  const stored = store('main.simulationRpcKeys')
  const keys: string[] = Array.isArray(stored) ? stored : []
  if (!keys.length) return [undefined]
  const now = Date.now()
  const start = cursor++ % keys.length
  const ordered = keys.map((_, i) => keys[(start + i) % keys.length] as string)
  const ready = ordered.filter((key) => (cooldownUntil.get(key) ?? 0) <= now)
  return ready.length ? ready : [undefined]
}

// Never log the URL or the key. Both can identify the account.
const post = async (network: string, key: string | undefined, payload: JSONRPCRequestPayload) => {
  const url = `https://lb.drpc.org/ogrpc?network=${network}${key ? `&dkey=${key}` : ''}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const body = (await response.json().catch(() => undefined)) as RPCResponsePayload | undefined
  return { status: response.status, body }
}

async function request(network: string, payload: JSONRPCRequestPayload): Promise<RPCResponsePayload> {
  // The public endpoint is always the last attempt, so spent keys never leave a request unanswered.
  const attempts = candidates()
  if (!attempts.includes(undefined)) attempts.push(undefined)
  for (const key of attempts) {
    try {
      const { status, body } = await post(network, key, payload)
      const code = (body?.error as { code?: unknown } | undefined)?.code
      // Code 4: "Your token is invalid or expired". A dead key never recovers, so treat it like a spent one.
      const exhausted = code === 10 || code === 4
      if (key && (exhausted || status === 429)) {
        cooldownUntil.set(key, Date.now() + (exhausted ? EXHAUSTED_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS))
        log.warn('Simulation RPC key unavailable', {
          network,
          reason: code === 4 ? 'invalid' : exhausted ? 'balance' : 'rate-limit'
        })
        continue
      }
      if (body && typeof body === 'object') return body
    } catch {
      // timeout or network failure: try the next key
    }
  }
  return {
    id: payload.id,
    jsonrpc: payload.jsonrpc,
    error: { message: 'Simulation RPC unavailable', code: -32000 }
  } as RPCResponsePayload
}

// Routes simulation reads to dRPC so debug_traceCall is available. Chains without a dRPC network use
// the configured RPC.
export const viaSimulationRpc =
  (configured: Send): Send =>
  (payload, callback, targetChain) => {
    const network = DRPC_NETWORKS[targetChain.id]
    if (!network) return configured(payload, callback, targetChain)
    void request(network, payload).then(callback)
  }
