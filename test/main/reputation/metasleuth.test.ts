import log from 'electron-log'

import {
  createMetasleuthReader,
  METASLEUTH_CHAIN_SLUGS,
  METASLEUTH_HEADERS
} from '../../../main/reputation/metasleuth'

jest.mock('electron-log', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), verbose: jest.fn() }
}))

const A = `0x${'ab'.repeat(20)}`
const B = `0x${'cd'.repeat(20)}`
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init)
const reply = (body: unknown, init?: ResponseInit) => jest.fn(async () => json(body, init))
const reader = (f: unknown, t = { now: 1_000_000 }) => createMetasleuthReader(f as typeof fetch, () => t.now)
const sent = (f: jest.Mock, i = 0) => ({
  url: String(f.mock.calls[i][0]),
  init: f.mock.calls[i][1] as RequestInit,
  body: JSON.parse(String((f.mock.calls[i][1] as RequestInit).body))
})

describe('metasleuth reader', () => {
  it('sends exactly the extension header set; the gate answers 403 otherwise', async () => {
    const f = reply([])
    await reader(f).addressLabels(1, [A])
    const { url, init } = sent(f)
    expect(url).toBe('https://extension.blocksec.com/api/v1/address-label')
    expect(init.headers).toEqual(METASLEUTH_HEADERS)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
  })

  it('sends the chain slug, never the chain name or id, and batches addresses in one call', async () => {
    const f = reply([
      { address: A.toUpperCase().replace('0X', '0x'), label: 'Uniswap', logo: 'https://x/y.png', risk: 0 }
    ])
    const out = await reader(f).addressLabels(1, [A, B])
    expect(f).toHaveBeenCalledTimes(1)
    expect(sent(f).body).toEqual({ chain: 'eth', addresses: [A, B] })
    expect(out).toEqual({ ok: true, value: new Map([[A, 'Uniswap']]) })
    expect(METASLEUTH_CHAIN_SLUGS[8453]).toBe('base')
  })

  it('reads the risk score from the risk call and drops riskDetailInfo', async () => {
    const f = reply({ address: A, risk: 5, riskDetailInfo: { big: 'x'.repeat(1000) } })
    const out = await reader(f).riskScore(1, A)
    expect(sent(f).body).toEqual({ chain: 'eth', address: A })
    expect(out).toEqual({ ok: true, value: { score: 5 } })
  })

  it('returns chain without a request for an unmapped chain id', async () => {
    const f = reply([])
    const r = reader(f)
    expect(await r.addressLabels(747474, [A])).toEqual({ ok: false, reason: 'chain' })
    expect(await r.riskScore(747474, A)).toEqual({ ok: false, reason: 'chain' })
    expect(f).not.toHaveBeenCalled()
  })

  it('blocks all calls for 10 min after a 403 and logs only a category', async () => {
    const t = { now: 1_000_000 }
    const f = jest.fn(async () => new Response('no', { status: 403 }))
    const r = reader(f, t)
    expect(await r.riskScore(1, A)).toEqual({ ok: false, reason: 'blocked' })
    expect(await r.addressLabels(1, [B])).toEqual({ ok: false, reason: 'blocked' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith('metasleuth blocked')
    t.now += 10 * 60_000 + 1
    await r.riskScore(1, A)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('maps 429 to rate-limit with the same block, other statuses to error', async () => {
    const f = jest.fn(async () => new Response('slow', { status: 429 }))
    const r = reader(f)
    expect(await r.riskScore(1, A)).toEqual({ ok: false, reason: 'rate-limit' })
    expect(await r.riskScore(1, A)).toEqual({ ok: false, reason: 'rate-limit' })
    expect(f).toHaveBeenCalledTimes(1)
    const g = jest.fn(async () => new Response('x', { status: 500 }))
    expect(await reader(g).riskScore(1, A)).toEqual({ ok: false, reason: 'error' })
  })

  it('rejects bad shapes and non-integer risk', async () => {
    for (const body of [
      { address: A, risk: 2.5 },
      { address: A, risk: 6 },
      { address: A, risk: '3' },
      { address: B, risk: 1 },
      { risk: 1 },
      []
    ]) {
      expect(await reader(reply(body)).riskScore(1, A)).toEqual({ ok: false, reason: 'error' })
    }
    for (const body of [{}, [{ label: 'x' }], [{ address: B, label: 'x' }], [{ address: A, label: 5 }]]) {
      expect(await reader(reply(body)).addressLabels(1, [A])).toEqual({ ok: false, reason: 'error' })
    }
    const notJson = jest.fn(async () => new Response('<html>'))
    expect(await reader(notJson).riskScore(1, A)).toEqual({ ok: false, reason: 'error' })
    const big = jest.fn(async () => new Response('x', { headers: { 'content-length': String(300 * 1024) } }))
    expect(await reader(big).riskScore(1, A)).toEqual({ ok: false, reason: 'error' })
  })

  it('sanitizes and caps label text, and treats missing labels as no label', async () => {
    const f = reply([
      { address: A, label: `Bad‮\n${'x'.repeat(200)}` },
      { address: B, label: null }
    ])
    const out = await reader(f).addressLabels(1, [A, B])
    expect(out.ok && out.value.get(A)).toBe(`Bad ${'x'.repeat(60)}`)
    expect(out.ok && out.value.has(B)).toBe(false)
  })
})
