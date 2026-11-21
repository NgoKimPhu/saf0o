/* eslint-disable @typescript-eslint/no-explicit-any -- loose request and call fixtures */
import { createReputationService, type Deps } from '../../../main/reputation'
import { createEtherscanReader } from '../../../main/reputation/etherscan'
import { createMetasleuthReader } from '../../../main/reputation/metasleuth'
import { getAddress } from 'ethers'
import { flushPromises } from '../../util'

jest.mock('../../../main/store', () => jest.fn())
jest.mock('electron-log', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), verbose: jest.fn() }
}))

const KEY = 'k'.repeat(32)
const ME = `0x${'11'.repeat(20)}`
const addr = (n: number) => `0x${n.toString(16).padStart(2, '0').repeat(20)}`
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const EMPTY_TXS = { status: '0', message: 'No transactions found', result: [] }

type Call = { host: string; action: string; params: Record<string, string>; body?: any }

// Routes mocked HTTP by host. `handlers` override the defaults per action/path.
function harness(
  opts: {
    handlers?: Record<string, (c: Call) => unknown | Promise<unknown>>
    state?: Record<string, unknown>
    key?: string | undefined
    keyThrows?: boolean
    meOn?: boolean
  } = {}
) {
  const calls: Call[] = []
  const t = { now: 1_800_000_000_000 }
  let msActive = 0
  let msMax = 0
  const fetchMock = jest.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input))
    const params = Object.fromEntries(url.searchParams)
    const call: Call = {
      host: url.host,
      action: url.host === 'api.etherscan.io' ? params['action'] : url.pathname.split('/').pop()!,
      params,
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    }
    calls.push(call)
    const handler = opts.handlers?.[call.action]
    if (handler) {
      msActive++
      msMax = Math.max(msMax, msActive)
      try {
        return json(await handler(call))
      } finally {
        msActive--
      }
    }
    switch (call.action) {
      case 'getcontractcreation':
        return json({ status: '0', message: 'NOTOK', result: 'No data found' })
      case 'getsourcecode':
        return json({ status: '1', message: 'OK', result: [{ ContractName: 'C', ABI: '[]', Proxy: '0' }] })
      case 'txlist':
        return json(EMPTY_TXS)
      case 'address-label':
        return json([])
      case 'address-risk-score':
        return json({ address: call.body.address, risk: 1 })
    }
    throw new Error(`unexpected ${call.action}`)
  })
  const state: Record<string, unknown> = { 'main.metasleuthLabels': true, ...opts.state }
  const deps: Deps = {
    etherscan: createEtherscanReader(
      fetchMock as unknown as typeof fetch,
      () => t.now,
      async () => undefined
    ),
    metasleuth: createMetasleuthReader(fetchMock as unknown as typeof fetch, () => t.now),
    now: () => t.now,
    getKey: () => {
      if (opts.keyThrows) throw new Error('keychain unavailable')
      return 'key' in opts ? opts.key : KEY
    },
    read: (path) => state[path]
  }
  return { service: createReputationService(deps), fetchMock, calls, t, state, msMax: () => msMax }
}

const walletCalls = (...to: string[]): any => ({
  type: 'walletCalls',
  handlerId: 'h',
  account: ME,
  chainId: '0x1',
  calls: to.map((a) => ({ to: a, data: '0x', value: '0x0' }))
})
const tx = (to: string, recipient?: string): any => ({
  type: 'transaction',
  handlerId: 'h',
  account: ME,
  data: { chainId: '0x1', to },
  recognizedActions: recipient ? [{ id: 'erc20:transfer', data: { recipient: { address: recipient } } }] : []
})
const hooks = (current = true) => ({ publish: jest.fn(), isCurrent: () => current })
const rows = (n: number, to: string) =>
  Array.from({ length: n }, (_, i) => ({ from: ME, to, timeStamp: String(1000 + i) }))
const hostCalls = (calls: Call[], host: string) => calls.filter((c) => c.host === host)

describe('syncReputation service', () => {
  it('makes no request for contacts, own accounts and custom tokens', async () => {
    const h = harness({
      state: {
        'main.addressBook': {
          [addr(0xa1)]: {
            name: 'Bob',
            address: getAddress(addr(0xa1)),
            provenance: { status: 'saved' },
            note: '',
            createdAt: 1,
            updatedAt: 1
          }
        },
        'main.accounts': { [addr(0xa2)]: { name: 'Savings' } },
        'main.tokens.custom': [
          { chainId: 1, address: addr(0xa3).toUpperCase().replace('0X', '0x'), symbol: 'USDC' }
        ]
      }
    })
    const req = walletCalls(addr(0xa1), addr(0xa2), addr(0xa3))
    await h.service.sync(req, hooks())
    // WHY: local identities are already known; sending them off-machine would only leak the address book
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(req.reputation.targets.map((t: any) => [t.state, t.level, t.signals.local.kind])).toEqual([
      ['done', 'trusted', 'contact'],
      ['done', 'trusted', 'account'],
      ['done', 'trusted', 'token']
    ])
  })

  it('does not trust a scanned token: lookups run and a MetaSleuth danger wins', async () => {
    const token = addr(0xb7)
    const h = harness({
      handlers: { 'address-risk-score': (c) => ({ address: c.body.address, risk: 5 }) },
      state: { 'main.tokens.known': { [ME]: [{ chainId: 1, address: token, symbol: 'AIRDROP' }] } }
    })
    const req = tx(token)
    await h.service.sync(req, hooks())
    // WHY: scanned tokens include airdrop spam, so they must not skip lookups or earn trust
    expect(hostCalls(h.calls, 'extension.blocksec.com').length).toBeGreaterThan(0)
    expect(hostCalls(h.calls, 'api.etherscan.io').length).toBeGreaterThan(0)
    expect(req.reputation.targets[0]).toMatchObject({ level: 'danger', signals: { knownToken: true } })
  })

  it('makes no request without a stored key and reports no-key', async () => {
    const h = harness({ key: undefined, state: { 'main.metasleuthLabels': false } })
    const req = tx(addr(0xb1))
    await h.service.sync(req, hooks())
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(req.reputation.targets[0]).toMatchObject({
      state: 'done',
      level: 'unknown',
      signals: { creation: { ok: false, reason: 'no-key' }, usage: { ok: false, reason: 'no-key' } }
    })
  })

  it('reports error, not no-key, when the key cannot be read', async () => {
    const h = harness({ keyThrows: true, state: { 'main.metasleuthLabels': false } })
    const req = tx(addr(0xb1))
    await h.service.sync(req, hooks())
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(req.reputation.targets[0].signals.creation).toEqual({ ok: false, reason: 'error' })
  })

  it('does nothing on a repeat sync but assesses a target that appears later', async () => {
    const h = harness()
    const req = tx(addr(0xc1))
    await h.service.sync(req, hooks())
    const before = h.calls.length
    await h.service.sync(req, hooks())
    expect(h.calls.length).toBe(before)
    // WHY: the recipient is only known once action recognition finishes, after admission
    req.recognizedActions = [{ id: 'erc20:transfer', data: { recipient: { address: addr(0xc2) } } }]
    await h.service.sync(req, hooks())
    expect(req.reputation.targets.map((t: any) => t.address)).toEqual([addr(0xc1), addr(0xc2)])
    expect(
      h.calls.slice(before).some((c) => c.params['address'] === addr(0xc2) || c.body?.address === addr(0xc2))
    ).toBe(true)
    expect(
      h.calls.slice(before).some((c) => c.params['address'] === addr(0xc1) || c.body?.address === addr(0xc1))
    ).toBe(false)
  })

  it('serves a repeat address from cache for 24 h and refreshes usage after 10 min', async () => {
    const h = harness()
    await h.service.sync(tx(addr(0xd1)), hooks())
    const first = h.calls.length
    await h.service.sync(tx(addr(0xd1)), hooks())
    expect(h.calls.length).toBe(first)

    h.t.now += 11 * 60_000
    const before = h.calls.length
    await h.service.sync(tx(addr(0xd1)), hooks())
    const again = h.calls.slice(before).map((c) => c.action)
    expect(again.sort()).toEqual(['txlist', 'txlist'].sort()) // target usage + own-history scan
    expect(again).not.toContain('getcontractcreation')
    expect(hostCalls(h.calls.slice(before), 'extension.blocksec.com')).toHaveLength(0)
  })

  it('scans your history once for all targets, in at most four pages', async () => {
    const full = (c: Call) =>
      c.params['address'] === ME ? { status: '1', message: 'OK', result: rows(250, addr(0xe1)) } : EMPTY_TXS
    const h = harness({ handlers: { txlist: full }, state: { 'main.metasleuthLabels': false } })
    const req = walletCalls(addr(0xe1), addr(0xe2))
    await h.service.sync(req, hooks())
    const scans = h.calls.filter((c) => c.action === 'txlist' && c.params['address'] === ME)
    expect(scans.map((c) => c.params['page'])).toEqual(['1', '2', '3', '4'])
    const [a, b] = req.reputation.targets
    expect(a.signals.yours).toEqual({ ok: true, value: { count: 1000, scanned: 1000, complete: false } })
    expect(b.signals.yours).toEqual({ ok: true, value: { count: 0, scanned: 1000, complete: false } })
  })

  it('stops scanning at a short page and marks the history complete', async () => {
    const h = harness({
      handlers: {
        txlist: (c) =>
          c.params['address'] === ME ? { status: '1', message: 'OK', result: rows(3, addr(0xe1)) } : EMPTY_TXS
      },
      state: { 'main.metasleuthLabels': false }
    })
    const req = tx(addr(0xe1))
    await h.service.sync(req, hooks())
    expect(h.calls.filter((c) => c.action === 'txlist' && c.params['address'] === ME)).toHaveLength(1)
    expect(req.reputation.targets[0].signals.yours).toEqual({
      ok: true,
      value: { count: 3, scanned: 3, complete: true }
    })
  })

  it('stops calling Etherscan for 10 s after a rate-limit reply', async () => {
    const h = harness({
      handlers: {
        getcontractcreation: () => ({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' })
      },
      state: { 'main.metasleuthLabels': false }
    })
    await h.service.sync(tx(addr(0xf1)), hooks())
    const before = h.calls.length
    const req = tx(addr(0xf2))
    await h.service.sync(req, hooks())
    expect(h.calls.length).toBe(before)
    expect(req.reputation.targets[0].signals.creation).toEqual({ ok: false, reason: 'rate-limit' })
  })

  it('keeps the other signals when one fails', async () => {
    const h = harness({
      handlers: {
        getcontractcreation: () => ({
          status: '1',
          message: 'OK',
          result: [{ contractAddress: addr(0x21), timestamp: '1700000000' }]
        }),
        getsourcecode: () => ({ status: '0', message: 'NOTOK', result: 'Query Timeout occured' }),
        txlist: (c) =>
          c.params['address'] === ME
            ? EMPTY_TXS
            : { status: '1', message: 'OK', result: [{ from: addr(0x99), to: addr(0x21), timeStamp: '5' }] }
      },
      state: { 'main.metasleuthLabels': false }
    })
    const req = tx(addr(0x21))
    await h.service.sync(req, hooks())
    const s = req.reputation.targets[0].signals
    expect(s.source).toEqual({ ok: false, reason: 'error' })
    expect(s.creation.ok).toBe(true)
    expect(s.usage.ok).toBe(true)
  })

  it('drops results for a request that is no longer current but still fills the cache', async () => {
    const h = harness({ state: { 'main.metasleuthLabels': false } })
    const stale = tx(addr(0x31))
    const hk = hooks(false)
    await h.service.sync(stale, hk)
    expect(hk.publish).not.toHaveBeenCalled()
    expect(stale.reputation.targets[0].state).toBe('pending')
    const before = h.calls.length
    const fresh = tx(addr(0x31))
    await h.service.sync(fresh, hooks())
    expect(h.calls.length).toBe(before)
    expect(fresh.reputation.targets[0].state).toBe('done')
  })

  it('publishes each completed target and marks pending first', async () => {
    const h = harness({ state: { 'main.metasleuthLabels': false } })
    const req = tx(addr(0x41))
    const hk = hooks()
    const done = h.service.sync(req, hk)
    expect(req.reputation.targets[0].state).toBe('pending')
    await done
    expect(req.reputation.targets[0].state).toBe('done')
    expect(hk.publish).toHaveBeenCalledTimes(1)
  })

  it('turns a 5 s timeout into an error signal and never throws', async () => {
    const hang = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const t = { now: 1 }
    const service = createReputationService({
      etherscan: createEtherscanReader(
        hang as unknown as typeof fetch,
        () => t.now,
        async () => undefined
      ),
      metasleuth: createMetasleuthReader(hang as unknown as typeof fetch, () => t.now),
      now: () => t.now,
      getKey: () => KEY,
      read: () => undefined
    })
    const req = tx(addr(0x51))
    const done = service.sync(req, hooks())
    await flushPromises()
    jest.advanceTimersByTime(5000)
    await done
    expect(req.reputation.targets[0].signals.creation).toEqual({ ok: false, reason: 'error' })
    expect(req.reputation.targets[0].state).toBe('done')
  })

  it('stops sending a rejected key', async () => {
    const h = harness({
      handlers: { getcontractcreation: () => ({ status: '0', message: 'NOTOK', result: 'Invalid API Key' }) },
      state: { 'main.metasleuthLabels': false }
    })
    const first = tx(addr(0x61))
    await h.service.sync(first, hooks())
    expect(first.reputation.targets[0].signals.creation).toEqual({ ok: false, reason: 'bad-key' })
    const before = hostCalls(h.calls, 'api.etherscan.io').length
    await h.service.sync(tx(addr(0x62)), hooks())
    // WHY: Etherscan throttles a key after a few invalid attempts
    expect(hostCalls(h.calls, 'api.etherscan.io')).toHaveLength(before)
  })
})

describe('MetaSleuth in the service', () => {
  it('makes no MetaSleuth request when the toggle is off, but Etherscan still runs', async () => {
    const h = harness({ state: { 'main.metasleuthLabels': false } })
    const req = tx(addr(0x71))
    await h.service.sync(req, hooks())
    // WHY: the toggle is the consent for sending addresses to BlockSec
    expect(hostCalls(h.calls, 'extension.blocksec.com')).toHaveLength(0)
    expect(hostCalls(h.calls, 'api.etherscan.io').length).toBeGreaterThan(0)
    expect(req.reputation.targets[0].signals).not.toHaveProperty('label')
    expect(req.reputation.targets[0].signals).not.toHaveProperty('risk')
  })

  it('never sends the signing account to MetaSleuth', async () => {
    const h = harness()
    await h.service.sync(tx(addr(0x72)), hooks())
    const ms = hostCalls(h.calls, 'extension.blocksec.com')
    expect(ms.length).toBeGreaterThan(0)
    expect(JSON.stringify(ms)).not.toContain(ME)
  })

  it('sends one label call and one risk call per target, at most three at once', async () => {
    const h = harness({
      handlers: {
        'address-risk-score': async (c) => (await flushPromises(), { address: c.body.address, risk: 2 })
      },
      state: { 'main.metasleuthLabels': true }
    })
    const targets = [1, 2, 3, 4, 5].map((n) => addr(0x80 + n))
    const req = walletCalls(...targets)
    await h.service.sync(req, hooks())
    const ms = hostCalls(h.calls, 'extension.blocksec.com')
    expect(ms.filter((c) => c.action === 'address-label')).toHaveLength(1)
    expect(ms.find((c) => c.action === 'address-label')!.body.addresses).toEqual(targets)
    expect(ms.filter((c) => c.action === 'address-risk-score')).toHaveLength(5)
    expect(h.msMax()).toBeLessThanOrEqual(3)
    expect(h.msMax()).toBeGreaterThan(1)
  })

  it('ranks a labeled address as trusted only through the risk-score call', async () => {
    const target = addr(0x90)
    const h = harness({
      handlers: {
        'address-label': () => [{ address: target, label: 'Uniswap V3: Router' }],
        'address-risk-score': (c) => ({ address: c.body.address, risk: 1 })
      },
      state: {}
    })
    const req = tx(target)
    await h.service.sync(req, hooks())
    expect(req.reputation.targets[0].level).toBe('trusted')

    const bad = harness({
      handlers: {
        'address-label': () => [{ address: target, label: 'Lazarus Group' }],
        'address-risk-score': (c) => ({ address: c.body.address, risk: 5 })
      }
    })
    const r2 = tx(target)
    await bad.service.sync(r2, hooks())
    expect(r2.reputation.targets[0].level).toBe('danger')
  })

  it('caps the targets assessed per request', async () => {
    const h = harness({ state: { 'main.metasleuthLabels': false } })
    const req = walletCalls(...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => addr(0xa0 + n)))
    await h.service.sync(req, hooks())
    expect(req.reputation.targets).toHaveLength(5)
  })
})
