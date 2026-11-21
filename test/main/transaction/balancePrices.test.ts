import { clearTrustedPriceCache, loadLlamaCurrent } from '../../../main/transaction/balancePrices'

const id = 'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const NOW = 1_800_000_000_000

const reply = (quote: object, ok = true) =>
  jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    headers: new Headers(),
    body: null,
    text: async () => JSON.stringify({ coins: { [id]: quote } })
  })
const good = { price: 0.9999, confidence: 0.95, timestamp: NOW / 1000 - 60 }
const run = (fetchImpl: jest.Mock, ids = [id]) => loadLlamaCurrent(ids, fetchImpl as never, () => NOW)

beforeEach(() => clearTrustedPriceCache())

it('accepts confidence 0.95 and rejects 0.5 so a thin market cannot set a displayed price', async () => {
  expect(await run(reply(good))).toEqual({ [id]: { price: 0.9999, confidence: 0.95 } })
  clearTrustedPriceCache()
  expect(await run(reply({ ...good, confidence: 0.5 }))).toEqual({})
})

it('rejects stale timestamps, bad prices and missing confidence', async () => {
  expect(await run(reply({ ...good, timestamp: NOW / 1000 - 3 * 3600 }))).toEqual({})
  clearTrustedPriceCache()
  expect(await run(reply({ ...good, price: 0 }))).toEqual({})
  clearTrustedPriceCache()
  expect(await run(reply({ price: 1, timestamp: NOW / 1000 }))).toEqual({})
})

it('returns {} on HTTP errors and thrown fetches, and caches the failure', async () => {
  const bad = reply(good, false)
  expect(await run(bad)).toEqual({})
  expect(await run(bad)).toEqual({})
  expect(bad).toHaveBeenCalledTimes(1)
  clearTrustedPriceCache()
  expect(await run(jest.fn().mockRejectedValue(new Error('timeout')))).toEqual({})
})

it('serves a second lookup within 60 s from cache, so re-simulations do not spam the network', async () => {
  const fetchImpl = reply(good)
  await run(fetchImpl)
  await run(fetchImpl)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('only calls coins.llama.fi with validated ids and never sends an account address', async () => {
  const fetchImpl = reply(good)
  await run(fetchImpl, [id, 'ethereum:0xnothex', '0x1111111111111111111111111111111111111111'])
  const [url, options] = fetchImpl.mock.calls[0]
  expect(url).toBe(`https://coins.llama.fi/prices/current/${id}`)
  expect(options.redirect).toBe('error')
})
