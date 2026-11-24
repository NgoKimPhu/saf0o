/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncBalancePreview } from '../../../main/transaction/balancePreview'
import { clearTrustedPriceCache } from '../../../main/transaction/balancePrices'

jest.mock('../../../main/reveal', () => ({ __esModule: true, default: { signingMetadata: jest.fn() } }))
jest.mock('../../../main/store', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('electron-log', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn() } }))

const account = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const scam = '0x4444444444444444444444444444444444444444'
const NOW = 1_800_000_000_000

const transfer = (from: string, to: string, amount: string, token = usdc) => ({
  type: 'transfer',
  standard: 'erc20',
  token,
  from,
  to,
  amount
})

const makeTx = (simulation: object): any => ({
  type: 'transaction',
  handlerId: 'h1',
  account,
  classification: 'CONTRACT_CALL',
  data: { chainId: '0x1', value: '0x0' },
  simulation
})
const succeeded = (extra: object = {}) => ({
  status: 'succeeded',
  source: 'eth_simulateV1',
  effects: [transfer(account, other, '1000000000')],
  ...extra
})

const llama = (coins: object) =>
  jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: null,
    text: async () => JSON.stringify({ coins })
  })
const usdcQuote = { price: 1, confidence: 0.99, timestamp: NOW / 1000 }

const setup = (overrides: object = {}) => {
  const publish = jest.fn()
  const current = { value: true }
  const deps = {
    now: () => NOW,
    balances: () => [],
    nativeUsd: () => 3000,
    metadata: jest.fn().mockResolvedValue({ tokens: [{ address: usdc, symbol: 'USDC', decimals: 6 }] }),
    fetch: llama({ [`ethereum:${usdc}`]: usdcQuote }),
    timeoutMs: 6000,
    ...overrides
  } as any
  const run = (req: any) => syncBalancePreview(req, { publish, isCurrent: () => current.value, deps })
  return { publish, current, deps, run }
}
const settle = () => jest.advanceTimersByTimeAsync(0)

beforeEach(() => clearTrustedPriceCache())

it('builds a raw preview synchronously, then prices it and publishes once', async () => {
  const { run, publish } = setup()
  const req = makeTx(succeeded())
  run(req)
  expect(req.balancePreview).toMatchObject({
    enriched: false,
    changes: [{ asset: usdc, delta: '-1000000000' }]
  })
  expect(publish).not.toHaveBeenCalled()
  await settle()
  expect(req.balancePreview.enriched).toBe(true)
  expect(req.balancePreview.changes[0].usd).toBeCloseTo(-1000)
  expect(req.balancePreview.tokens[usdc]).toEqual({ symbol: 'USDC', decimals: 6, known: false })
  expect(publish).toHaveBeenCalledTimes(1)
})

it('does not refetch or republish when a gas refresh yields the same evidence', async () => {
  const { run, publish, deps } = setup()
  const req = makeTx(succeeded())
  run(req)
  await settle()
  req.simulation = succeeded({ gasUsed: '0x5208' })
  run(req)
  await settle()
  expect(deps.fetch).toHaveBeenCalledTimes(1)
  expect(deps.metadata).toHaveBeenCalledTimes(1)
  expect(publish).toHaveBeenCalledTimes(1)
})

it('does not retry a failed enrichment on every re-simulation', async () => {
  const { run, deps } = setup({ metadata: jest.fn().mockRejectedValue(new Error('rpc')) })
  const req = makeTx(succeeded())
  run(req)
  await settle()
  run(req)
  await settle()
  expect(deps.metadata).toHaveBeenCalledTimes(1)
  expect(req.balancePreview.enriched).toBe(false)
})

it('updates the preview when the final result adds the native change', async () => {
  const { run } = setup()
  const req = makeTx(succeeded())
  run(req)
  await settle()
  req.simulation = succeeded({
    nativeBalanceChanges: {
      status: 'succeeded',
      source: 'debug_traceCall',
      changes: [{ account, before: '0', after: '1', change: '310000000000000000' }]
    }
  })
  run(req)
  expect(req.balancePreview.enriched).toBe(false)
  expect(req.balancePreview.changes.map((c: any) => c.asset)).toEqual(['native', usdc])
  await settle()
  expect(req.balancePreview.changes[0].usd).toBeCloseTo(930)
})

it('deletes the preview when the simulation is no longer successful', async () => {
  const { run } = setup()
  const req = makeTx(succeeded())
  run(req)
  req.simulation = { status: 'reverted' }
  run(req)
  expect(req.balancePreview).toBeUndefined()
})

it('keeps the raw unpriced preview when enrichment times out', async () => {
  const { run, publish } = setup({ metadata: jest.fn(() => new Promise(() => undefined)) })
  const req = makeTx(succeeded())
  run(req)
  await jest.advanceTimersByTimeAsync(6001)
  expect(req.balancePreview.enriched).toBe(false)
  expect(req.balancePreview.changes[0].usd).toBeUndefined()
  expect(publish).not.toHaveBeenCalled()
})

it('never prices a token from main.rates: a scam token can fake a pool price there', async () => {
  const store = jest.requireMock('../../../main/store').default as jest.Mock
  store.mockImplementation((...path: string[]) =>
    path.join('.').startsWith('main.rates') ? { usd: { price: 1_000_000 } } : undefined
  )
  const { run } = setup({
    metadata: jest.fn().mockResolvedValue({ tokens: [{ address: scam, symbol: 'USDC', decimals: 18 }] }),
    fetch: llama({})
  })
  const req = makeTx(succeeded({ effects: [transfer(other, account, '10', scam)] }))
  run(req)
  await settle()
  expect(req.balancePreview.enriched).toBe(true)
  expect(req.balancePreview.changes[0].usd).toBeUndefined()
  store.mockReset()
})

it('marks tokens outside the user balances as unknown and tokens in them as known', async () => {
  const { run } = setup({
    balances: () => [
      { address: usdc.toUpperCase().replace('0X', '0x'), chainId: 1, symbol: 'USDC', decimals: 6 }
    ],
    metadata: jest.fn().mockResolvedValue({ tokens: [{ address: scam, symbol: 'USDC', decimals: 18 }] })
  })
  const req = makeTx(
    succeeded({ effects: [transfer(account, other, '1', usdc), transfer(other, account, '1', scam)] })
  )
  run(req)
  expect(req.balancePreview.tokens[usdc].known).toBe(true)
  await settle()
  expect(req.balancePreview.tokens[usdc].known).toBe(true)
  expect(req.balancePreview.tokens[scam].known).toBe(false)
})

it('discards a result that lands after the request was replaced or the evidence changed', async () => {
  const first = setup()
  const req = makeTx(succeeded())
  first.run(req)
  first.current.value = false
  await settle()
  expect(req.balancePreview.enriched).toBe(false)
  expect(first.publish).not.toHaveBeenCalled()

  const second = setup()
  const req2 = makeTx(succeeded())
  second.run(req2)
  req2.simulation = succeeded({ effects: [transfer(account, other, '5')] })
  second.run(req2)
  await settle()
  expect(req2.balancePreview.changes[0].delta).toBe('-5')
  expect(req2.balancePreview.enriched).toBe(true)
  expect(second.publish).toHaveBeenCalledTimes(1)
})

it('flattens effects across wallet calls and falls back to call values for native out', async () => {
  const { run } = setup()
  const req: any = {
    type: 'walletCalls',
    handlerId: 'w1',
    account,
    chainId: '0x1',
    calls: [
      { to: other, data: '0x', value: '0x64' },
      { to: other, data: '0x', value: '0x1' }
    ],
    simulation: {
      status: 'succeeded',
      source: 'eth_simulateV1',
      calls: [
        { status: 'succeeded', effects: [transfer(account, other, '3')] },
        { status: 'succeeded', effects: [transfer(account, other, '4')] }
      ]
    }
  }
  run(req)
  expect(req.balancePreview.changes).toEqual([
    { asset: 'native', standard: 'native', delta: '-101' },
    { asset: usdc, standard: 'erc20', delta: '-7' }
  ])
})

// A missing trace used to look the same as "no ETH moves". The preview must say the number is absent.
it('flags that native changes are missing when the trace is unavailable', () => {
  const req = makeTx(
    succeeded({
      nativeBalanceChanges: {
        status: 'unavailable',
        source: 'debug_traceCall',
        reason: 'Configured RPC does not support native balance-change tracing'
      }
    })
  )
  setup().run(req)
  expect(req.balancePreview.nativeNote).toBe('Configured RPC does not support native balance-change tracing')

  const traced = makeTx(succeeded())
  setup().run(traced)
  expect(traced.balancePreview.nativeNote).toBeUndefined()
})
