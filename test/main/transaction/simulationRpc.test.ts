/* eslint-disable @typescript-eslint/no-explicit-any */
import log from 'electron-log'
import store from '../../../main/store'
import { resetSimulationRpcState, viaSimulationRpc } from '../../../main/transaction/simulationRpc'

jest.mock('../../../main/store', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('electron-log', () => ({ __esModule: true, default: { warn: jest.fn() } }))

const KEYS = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc']
const payload: any = { id: 1, jsonrpc: '2.0', method: 'debug_traceCall', params: [] }
const arbitrum: any = { type: 'ethereum', id: 42161 }

const ok = { status: 200, json: async () => ({ id: 1, jsonrpc: '2.0', result: 'ok' }) }
const exhausted = {
  status: 200,
  json: async () => ({ id: 1, jsonrpc: '2.0', error: { code: 10, message: 'User balance exceeded' } })
}

const run = (chain: any = arbitrum, configured: any = jest.fn()) =>
  new Promise<any>((resolve) => viaSimulationRpc(configured)(payload, resolve, chain))
const urls = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([url]) => String(url))

let fetchMock: jest.Mock
beforeEach(() => {
  resetSimulationRpcState()
  ;(store as unknown as jest.Mock).mockImplementation((path: string) =>
    path === 'main.simulationRpcKeys' ? KEYS : undefined
  )
  fetchMock = jest.fn().mockResolvedValue(ok)
  global.fetch = fetchMock as any
  ;(log.warn as jest.Mock).mockClear()
})

it('rotates through the keys so no single key carries every simulation', async () => {
  await run()
  await run()
  await run()
  expect(urls(fetchMock).map((u) => u.split('dkey=')[1])).toEqual(KEYS)
})

// A key with no balance would fail every simulation until restart. The next key must carry it,
// and the spent key must not be tried again for an hour.
it('skips a key whose balance is used up and keeps it out of rotation', async () => {
  fetchMock.mockImplementation(async (url: string) => (url.includes(KEYS[0]!) ? exhausted : ok))
  expect((await run()).result).toBe('ok')
  await run()
  await run()
  const used = urls(fetchMock).map((u) => u.split('dkey=')[1])
  expect(used.filter((k) => k === KEYS[0])).toHaveLength(1)
  expect(used.slice(1).every((k) => k === KEYS[1] || k === KEYS[2])).toBe(true)
})

// dRPC answers an expired key with code 4. Returning that as the result made every simulation
// fail with "Execution Check Failed" while a working key or the public endpoint was available.
it('skips an invalid or expired key instead of returning its error', async () => {
  const invalid = {
    status: 200,
    json: async () => ({
      id: 1,
      jsonrpc: '2.0',
      error: { code: 4, message: 'Your token is invalid or expired' }
    })
  }
  fetchMock.mockImplementation(async (url: string) => (url.includes(KEYS[0]!) ? invalid : ok))
  expect((await run()).result).toBe('ok')
  await run()
  await run()
  const used = urls(fetchMock).map((u) => u.split('dkey=')[1])
  expect(used.filter((k) => k === KEYS[0])).toHaveLength(1)
})

it('falls back to the public endpoint when every key is spent, and when none are stored', async () => {
  fetchMock.mockImplementation(async (url: string) => (url.includes('dkey=') ? exhausted : ok))
  expect((await run()).result).toBe('ok')
  expect(urls(fetchMock).at(-1)).toBe('https://lb.drpc.org/ogrpc?network=arbitrum')

  resetSimulationRpcState()
  ;(store as unknown as jest.Mock).mockReturnValue(undefined)
  fetchMock.mockClear()
  await run()
  expect(urls(fetchMock)).toEqual(['https://lb.drpc.org/ogrpc?network=arbitrum'])
})

it('uses the configured RPC for a chain dRPC does not serve', async () => {
  const configured = jest.fn()
  viaSimulationRpc(configured)(payload, jest.fn(), { type: 'ethereum', id: 999999 } as any)
  expect(configured).toHaveBeenCalledTimes(1)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('returns an error response when dRPC cannot be reached', async () => {
  fetchMock.mockRejectedValue(new Error('offline'))
  expect((await run()).error.message).toBe('Simulation RPC unavailable')
})

// Keys and URLs can identify the account, so a cooldown warning may name only the network and reason.
it('never writes a key to the log', async () => {
  fetchMock.mockImplementation(async (url: string) => (url.includes(KEYS[0]!) ? exhausted : ok))
  await run()
  expect(JSON.stringify((log.warn as jest.Mock).mock.calls)).not.toMatch(/aaaaaaaa|dkey/)
})
