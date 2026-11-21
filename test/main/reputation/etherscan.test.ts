import { createEtherscanReader } from '../../../main/reputation/etherscan'

const KEY = 'k'.repeat(32)
const ADDR = `0x${'ab'.repeat(20)}`
const OTHER = `0x${'cd'.repeat(20)}`
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
const reply = (body: unknown, init?: ResponseInit) => jest.fn(async () => json(body, init))
const reader = (fetchImpl: unknown, t = { now: 1_000_000 }) =>
  createEtherscanReader(
    fetchImpl as typeof fetch,
    () => t.now,
    async (ms) => void (t.now += ms)
  )
const urlOf = (f: jest.Mock, i = 0) => new URL(String(f.mock.calls[i][0]))

describe('etherscan reputation reader', () => {
  it('sends the documented parameters for each endpoint', async () => {
    const f = reply({ status: '1', message: 'OK', result: [] })
    const r = reader(f)
    await r.contractCreation(1, ADDR, KEY)
    await r.sourceCode(137, ADDR, KEY)
    await r.txList(42161, ADDR, KEY, { page: 2, offset: 250 })
    const [a, b, c] = [0, 1, 2].map((i) => Object.fromEntries(urlOf(f, i).searchParams))
    expect(urlOf(f).origin + urlOf(f).pathname).toBe('https://api.etherscan.io/v2/api')
    expect(a).toEqual({
      chainid: '1',
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: ADDR,
      apikey: KEY
    })
    expect(b).toEqual({
      chainid: '137',
      module: 'contract',
      action: 'getsourcecode',
      address: ADDR,
      apikey: KEY
    })
    expect(c).toEqual({
      chainid: '42161',
      module: 'account',
      action: 'txlist',
      address: ADDR,
      startblock: '0',
      endblock: '99999999',
      page: '2',
      offset: '250',
      sort: 'desc',
      apikey: KEY
    })
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('parses creation, source and tx rows', async () => {
    const created = reader(
      reply({
        status: '1',
        message: 'OK',
        result: [{ contractAddress: ADDR.toUpperCase().replace('0X', '0x'), timestamp: '1700000000' }]
      })
    )
    expect(await created.contractCreation(1, ADDR, KEY)).toEqual({
      ok: true,
      value: { isContract: true, createdAt: 1700000000 }
    })
    const src = reader(
      reply({
        status: '1',
        message: 'OK',
        result: [{ ContractName: 'Evil‮Name\n', ABI: '[]', Proxy: '1' }]
      })
    )
    expect(await src.sourceCode(1, ADDR, KEY)).toEqual({
      ok: true,
      value: { verified: true, name: 'Evil Name', proxy: true }
    })
    const unv = reader(
      reply({
        status: '1',
        message: 'OK',
        result: [{ ContractName: 'X', ABI: 'Contract source code not verified', Proxy: '0' }]
      })
    )
    expect(await unv.sourceCode(1, ADDR, KEY)).toEqual({ ok: true, value: { verified: false, proxy: false } })
    const tx = reader(
      reply({
        status: '1',
        message: 'OK',
        result: [
          { from: ADDR, to: '', timeStamp: '5', input: '0x' },
          { from: OTHER, to: ADDR, timeStamp: '4' }
        ]
      })
    )
    expect(await tx.txList(1, ADDR, KEY, { page: 1, offset: 200 })).toEqual({
      ok: true,
      value: [
        { from: ADDR, to: '', timestamp: 5 },
        { from: OTHER, to: ADDR, timestamp: 4 }
      ]
    })
  })

  it('treats an empty history and a non-contract as benign', async () => {
    const empty = reply({ status: '0', message: 'No transactions found', result: [] })
    expect(await reader(empty).txList(1, ADDR, KEY, { page: 1, offset: 200 })).toEqual({
      ok: true,
      value: []
    })
    const eoa = reply({ status: '0', message: 'NOTOK', result: 'No data found' })
    expect(await reader(eoa).contractCreation(1, ADDR, KEY)).toEqual({
      ok: true,
      value: { isContract: false }
    })
  })

  it.each([
    ['Max rate limit reached, please use API Key for higher rate limit', 'rate-limit'],
    ['Invalid API Key', 'bad-key'],
    ['Missing or unsupported chainid parameter (required for v2 api)', 'chain'],
    ['Free API access is not supported for this chain. Please upgrade your api plan', 'chain'],
    ['Query Timeout occured', 'error']
  ])('classifies "%s" as %s', async (text, reason) => {
    const f = reply({ status: '0', message: 'NOTOK', result: text })
    expect(await reader(f).sourceCode(1, ADDR, KEY)).toEqual({ ok: false, reason })
  })

  it('returns error for non-JSON, oversized, redirected, non-2xx and malformed replies', async () => {
    const bad: unknown[] = [
      jest.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })),
      jest.fn(async () => new Response('{', { headers: { 'content-type': 'application/json' } })),
      jest.fn(async () => json({ status: '1', message: 'OK', result: [] }, { status: 500 })),
      jest.fn(async () => {
        throw new TypeError('redirect mode is set to error')
      }),
      reply({ status: 1, message: 'OK', result: [] }),
      reply({ status: '1', message: 'OK', result: [{ from: 'nope', to: ADDR, timeStamp: '1' }] }),
      reply({ status: '1', message: 'OK', result: [{ from: ADDR, to: ADDR, timeStamp: 'x' }] }),
      reply({
        status: '1',
        message: 'OK',
        result: new Array(1001).fill({ from: ADDR, to: ADDR, timeStamp: '1' })
      })
    ]
    for (const f of bad) {
      expect(await reader(f).txList(1, ADDR, KEY, { page: 1, offset: 200 })).toEqual({
        ok: false,
        reason: 'error'
      })
    }
    const huge = jest.fn(
      async () =>
        new Response('x', {
          headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024) }
        })
    )
    expect(await reader(huge).txList(1, ADDR, KEY, { page: 1, offset: 200 })).toEqual({
      ok: false,
      reason: 'error'
    })
  })

  it('rejects bad input without a request', async () => {
    const f = reply({ status: '1', message: 'OK', result: [] })
    const r = reader(f)
    expect(await r.sourceCode(1, 'nope', KEY)).toEqual({ ok: false, reason: 'error' })
    expect(await r.sourceCode(0, ADDR, KEY)).toEqual({ ok: false, reason: 'error' })
    expect(await r.sourceCode(1, ADDR, 'short')).toEqual({ ok: false, reason: 'bad-key' })
    expect(await r.txList(1, ADDR, KEY, { page: 1, offset: 5000 })).toEqual({ ok: false, reason: 'error' })
    expect(f).not.toHaveBeenCalled()
  })

  it('blocks calls for 10 s after a rate-limit reply', async () => {
    const t = { now: 1_000_000 }
    const f = reply({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' })
    const r = reader(f, t)
    await r.sourceCode(1, ADDR, KEY)
    expect(await r.sourceCode(1, ADDR, KEY)).toEqual({ ok: false, reason: 'rate-limit' })
    expect(f).toHaveBeenCalledTimes(1)
    t.now += 10_001
    await r.sourceCode(1, ADDR, KEY)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('stops sending a rejected key for 5 min, so invalid-key throttling is not triggered', async () => {
    const t = { now: 1_000_000 }
    const f = reply({ status: '0', message: 'NOTOK', result: 'Invalid API Key' })
    const r = reader(f, t)
    await r.sourceCode(1, ADDR, KEY)
    await r.txList(1, ADDR, KEY, { page: 1, offset: 200 })
    expect(f).toHaveBeenCalledTimes(1)
    await r.sourceCode(1, ADDR, 'z'.repeat(32))
    expect(f).toHaveBeenCalledTimes(2)
    t.now += 5 * 60_000 + 1
    await r.sourceCode(1, ADDR, KEY)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('queues concurrent calls into slots at least 400 ms apart', async () => {
    const waits: number[] = []
    const f = reply({ status: '1', message: 'OK', result: [] })
    const r = createEtherscanReader(
      f as unknown as typeof fetch,
      () => 1_000_000,
      async (ms) => void waits.push(ms)
    )
    await Promise.all([1, 2, 3].map(() => r.txList(1, ADDR, KEY, { page: 1, offset: 200 })))
    expect(waits).toEqual([400, 800])
  })

  it('never leaks the key in errors', async () => {
    const f = jest.fn(async () => {
      throw new Error(`failed https://api.etherscan.io/v2/api?apikey=${KEY}`)
    })
    const out = await reader(f).sourceCode(1, ADDR, KEY)
    expect(out).toEqual({ ok: false, reason: 'error' })
    expect(JSON.stringify(out)).not.toContain(KEY)
  })
})
