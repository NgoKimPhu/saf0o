import type { TransactionRequest, WalletCallsRequest } from '../accounts/types'
import { transactionOutboundTargets, walletCallsOutboundTargets } from '../addressSafety'
import store from '../store'
import { resolveLocalAddressIdentity } from '../../resources/domain/addressBook/identity'
import {
  reputationLevel,
  type ReputationLevel,
  type Signal,
  type TargetSignals,
  type Unavailable
} from '../../resources/domain/reputation/level'
import { parseRpcQuantity } from '../../resources/domain/transaction/quantity'
import { createEtherscanReader, type EtherscanReader } from './etherscan'
import { createMetasleuthReader, type MetasleuthReader } from './metasleuth'

export type TargetReputation = Readonly<{
  address: string
  state: 'pending' | 'done'
  level: ReputationLevel
  signals: TargetSignals
}>
export type ReputationAssessment = Readonly<{
  chainId: number
  assessedAt: number
  targets: readonly TargetReputation[]
}>

type Req = TransactionRequest | WalletCallsRequest
type Hooks = { publish: () => void; isCurrent: () => boolean }
export type Deps = Partial<{
  etherscan: EtherscanReader
  metasleuth: MetasleuthReader
  now: () => number
  sleep: (ms: number) => Promise<void>
  // Resolves the stored Etherscan key; undefined = none stored. It must never be logged.
  getKey: () => string | undefined | Promise<string | undefined>
  read: (path: string) => unknown
}>

const HOUR = 3_600_000
const TTL = { creation: 24 * HOUR, source: 24 * HOUR, label: 24 * HOUR, risk: 24 * HOUR, usage: 10 * 60_000 }
const FAILURE_TTL = 60_000
const MAX_CACHE = 500
// Request targets are capped at 500 upstream; one request never needs more than a few remote lookups.
const MAX_TARGETS = 5
const MAX_SCAN_PAGES = 4
const SCAN_PAGE = 250
const USAGE_PAGE = 200
const MS_CONCURRENCY = 3

const unavailable = (reason: Unavailable): Signal<never> => ({ ok: false, reason })
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Lazy, so loading this module does not pull in the provider (which imports accounts).
const defaultGetKey = async () =>
  (await import('../contractVerification/runtime')).contractVerificationCredentialStore.load()

type YoursScan = Readonly<{ counts: ReadonlyMap<string, number>; scanned: number; complete: boolean }>

export function createReputationService(deps: Deps = {}) {
  const now = deps.now ?? Date.now
  const etherscan = deps.etherscan ?? createEtherscanReader(fetch, now, deps.sleep)
  const metasleuth = deps.metasleuth ?? createMetasleuthReader(fetch, now)
  const getKey = deps.getKey ?? defaultGetKey
  const read = deps.read ?? ((path: string) => store(path))

  type Entry = { at: number; ttl: number; signal: Signal<unknown> }
  const caches = {
    creation: new Map<string, Entry>(),
    source: new Map<string, Entry>(),
    usage: new Map<string, Entry>(),
    yours: new Map<string, Entry>(),
    label: new Map<string, Entry>(),
    risk: new Map<string, Entry>()
  }
  const inflight = new Map<string, Promise<Signal<unknown>>>()

  const remember = (cache: Map<string, Entry>, key: string, signal: Signal<unknown>, ttl: number) => {
    cache.delete(key)
    cache.set(key, { at: now(), ttl: signal.ok ? ttl : FAILURE_TTL, signal })
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string)
  }

  // Cache successes for `ttl`, failures for 60 s, and share one in-flight call per key.
  async function memo<T>(
    kind: keyof typeof caches,
    key: string,
    ttl: number,
    run: () => Promise<Signal<T>>
  ): Promise<Signal<T>> {
    const cache = caches[kind]
    const hit = cache.get(key)
    if (hit && now() - hit.at < hit.ttl) return hit.signal as Signal<T>
    const flightKey = `${kind}:${key}`
    const pending = inflight.get(flightKey)
    if (pending) return pending as Promise<Signal<T>>
    const flight = run()
      .catch((): Signal<T> => unavailable('error'))
      .then((signal) => {
        remember(cache, key, signal, ttl)
        return signal
      })
      .finally(() => inflight.delete(flightKey))
    inflight.set(flightKey, flight)
    return flight
  }

  // One scan of the account's recent history serves every target of every request.
  const scanYours = (chainId: number, account: string, key: string) =>
    memo<YoursScan>('yours', `${chainId}:${account}`, TTL.usage, async () => {
      const counts = new Map<string, number>()
      let scanned = 0
      for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
        const rows = await etherscan.txList(chainId, account, key, { page, offset: SCAN_PAGE })
        if (!rows.ok) return rows
        for (const row of rows.value) {
          if (row.from === account && row.to) counts.set(row.to, (counts.get(row.to) ?? 0) + 1)
        }
        scanned += rows.value.length
        if (rows.value.length < SCAN_PAGE) return { ok: true, value: { counts, scanned, complete: true } }
      }
      return { ok: true, value: { counts, scanned, complete: false } }
    })

  async function etherscanSignals(
    chainId: number,
    account: string,
    address: string,
    key: string
  ): Promise<Partial<TargetSignals>> {
    const id = `${chainId}:${address}`
    const creation = memo('creation', id, TTL.creation, () =>
      etherscan.contractCreation(chainId, address, key)
    )
    const source = creation.then((c) =>
      c.ok && c.value.isContract
        ? memo('source', id, TTL.source, () => etherscan.sourceCode(chainId, address, key))
        : undefined
    )
    const usage = memo('usage', id, TTL.usage, async () => {
      const rows = await etherscan.txList(chainId, address, key, { page: 1, offset: USAGE_PAGE })
      if (!rows.ok) return rows
      const times = rows.value.map((r) => r.timestamp)
      return {
        ok: true,
        value: {
          txs: rows.value.length,
          senders: new Set(rows.value.map((r) => r.from)).size,
          spanDays: times.length ? (Math.max(...times) - Math.min(...times)) / 86400 : 0,
          sampleFull: rows.value.length === USAGE_PAGE
        }
      }
    })
    const yours = scanYours(chainId, account, key).then(
      (scan): Signal<{ count: number; scanned: number; complete: boolean }> =>
        scan.ok
          ? {
              ok: true,
              value: {
                count: scan.value.counts.get(address) ?? 0,
                scanned: scan.value.scanned,
                complete: scan.value.complete
              }
            }
          : scan
    )
    const [c, s, u, y] = await Promise.all([creation, source, usage, yours])
    return { creation: c, ...(s ? { source: s } : {}), usage: u, yours: y }
  }

  // One label call for the uncached addresses, then one risk call per address, three at a time.
  function metasleuthSignals(chainId: number, addresses: string[]) {
    const labelsReady = (async () => {
      const missing = addresses.filter((a) => {
        const hit = caches.label.get(`${chainId}:${a}`)
        return !(hit && now() - hit.at < hit.ttl)
      })
      if (!missing.length) return
      const result = await metasleuth
        .addressLabels(chainId, missing)
        .catch((): Signal<never> => unavailable('error'))
      for (const a of missing) {
        remember(
          caches.label,
          `${chainId}:${a}`,
          result.ok ? { ok: true, value: { name: result.value.get(a) } } : result,
          TTL.label
        )
      }
    })()

    let active = 0
    const waiting: Array<() => void> = []
    const limited = async <T>(run: () => Promise<T>) => {
      if (active >= MS_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve))
      active++
      try {
        return await run()
      } finally {
        active--
        waiting.shift()?.()
      }
    }

    return (address: string) =>
      Promise.all([
        labelsReady.then(
          (): Signal<{ name?: string }> =>
            (caches.label.get(`${chainId}:${address}`)?.signal as Signal<{ name?: string }> | undefined) ??
            unavailable('error')
        ),
        limited(() =>
          memo('risk', `${chainId}:${address}`, TTL.risk, () => metasleuth.riskScore(chainId, address))
        )
      ]).then(([label, risk]) => ({ label, risk }) as Partial<TargetSignals>)
  }

  const localSignals = (chainId: number, address: string): TargetSignals['local'] => {
    const identity = resolveLocalAddressIdentity(read('main.addressBook'), read('main.accounts'), address)
    if (identity) return { kind: identity.kind, label: identity.label }
    const known = Object.values((read('main.tokens.known') as Record<string, unknown[]> | undefined) ?? {})
    const custom = (read('main.tokens.custom') as unknown[] | undefined) ?? []
    for (const token of [...known.flat(), ...custom]) {
      if (
        isRecord(token) &&
        Number(token['chainId']) === chainId &&
        typeof token['address'] === 'string' &&
        token['address'].toLowerCase() === address
      ) {
        return {
          kind: 'token',
          ...(typeof token['symbol'] === 'string' ? { label: token['symbol'].slice(0, 32) } : {})
        }
      }
    }
    return undefined
  }

  const seen = new WeakMap<object, Map<string, 'pending' | 'done'>>()

  function sync(req: Req, hooks: Hooks): Promise<void> {
    let chainId: number
    try {
      chainId = Number(parseRpcQuantity(req.type === 'transaction' ? req.data.chainId : req.chainId))
    } catch {
      return Promise.resolve()
    }
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return Promise.resolve()

    let states = seen.get(req)
    if (!states) seen.set(req, (states = new Map()))
    const targets = (
      req.type === 'transaction' ? transactionOutboundTargets(req) : walletCallsOutboundTargets(req)
    ).filter((a) => !states.has(a))
    const room = MAX_TARGETS - states.size
    // Targets past the cap are marked seen so they are not retried, and get no entry.
    for (const a of targets.slice(Math.max(room, 0))) states.set(a, 'done')
    const fresh = targets.slice(0, Math.max(room, 0))
    if (!fresh.length) return Promise.resolve()

    const lookalike = (address: string) =>
      req.addressSafety?.targets.some((t) => t.address === address && t.state === 'lookalike') ?? false
    const entry = (
      address: string,
      state: TargetReputation['state'],
      signals: Omit<TargetSignals, 'lookalike'>
    ): TargetReputation => {
      const all: TargetSignals = { ...signals, lookalike: lookalike(address) }
      return { address, state, level: reputationLevel(all, now()), signals: all }
    }
    const put = (e: TargetReputation) => {
      const targets = req.reputation?.targets ?? []
      const at = targets.findIndex((t) => t.address === e.address)
      req.reputation = {
        chainId,
        assessedAt: now(),
        targets: at < 0 ? [...targets, e] : targets.map((t, i) => (i === at ? e : t))
      }
    }

    const remote: string[] = []
    for (const address of fresh) {
      const local = localSignals(chainId, address)
      states.set(address, local ? 'done' : 'pending')
      put(entry(address, local ? 'done' : 'pending', local ? { local } : {}))
      if (!local) remote.push(address)
    }
    if (!remote.length) return Promise.resolve()

    return assess(req, chainId, remote, entry, put, hooks, states)
  }

  async function assess(
    req: Req,
    chainId: number,
    addresses: string[],
    entry: (
      a: string,
      s: TargetReputation['state'],
      sig: Omit<TargetSignals, 'lookalike'>
    ) => TargetReputation,
    put: (e: TargetReputation) => void,
    hooks: Hooks,
    states: Map<string, 'pending' | 'done'>
  ) {
    const account = req.account.toLowerCase()
    let key: string | undefined
    let keyFailure: Unavailable = 'no-key'
    try {
      key = await getKey()
    } catch {
      keyFailure = 'error'
    }
    const ms = read('main.metasleuthLabels') !== false ? metasleuthSignals(chainId, addresses) : undefined
    const none = unavailable(keyFailure)

    await Promise.all(
      addresses.map(async (address) => {
        const parts = await Promise.all([
          key
            ? etherscanSignals(chainId, account, address, key)
            : Promise.resolve<Partial<TargetSignals>>({
                creation: none,
                source: none,
                usage: none,
                yours: none
              }),
          ms ? ms(address) : Promise.resolve<Partial<TargetSignals>>({})
        ]).catch((): Partial<TargetSignals>[] => [{ creation: unavailable('error') }, {}])
        states.set(address, 'done')
        if (!hooks.isCurrent()) return
        put(entry(address, 'done', Object.assign({}, ...parts)))
        hooks.publish()
      })
    )
  }

  return { sync }
}

const service = createReputationService()

export function syncReputation(req: Req, hooks: Hooks): void {
  void service.sync(req, hooks)
}
