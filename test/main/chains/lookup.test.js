import { lookupChain, resetChainListCache } from '../../../main/chains/lookup'

jest.mock('electron-log', () => ({ warn: jest.fn() }))

const listed = {
  chainId: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  explorers: [{ url: 'http://insecure.example' }, { url: 'https://bscscan.com' }],
  isTestnet: false,
  rpc: [
    { url: 'https://tracker.example', tracking: 'yes' },
    { url: 'https://keyed.example/${API_KEY}', tracking: 'none' },
    { url: 'https://user:pw@creds.example', tracking: 'none' },
    { url: 'wss://socket.example', tracking: 'none' },
    { url: 'https://private.example', tracking: 'none' }
  ]
}

beforeEach(() => {
  resetChainListCache()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [listed] })
})

test('keeps only safe https RPCs, private ones first, and the https explorer', async () => {
  // A dapp-free wallet must not save an RPC that needs a key or carries credentials.
  expect(await lookupChain(56)).toMatchObject({
    id: 56,
    explorer: 'https://bscscan.com',
    rpcUrls: ['https://private.example', 'https://tracker.example']
  })
})

test('reports an unknown chain id and a failed fetch', async () => {
  expect(await lookupChain(999999)).toEqual({ error: 'Chain ID not found on chainlist.org' })
  resetChainListCache()
  global.fetch.mockRejectedValue(new Error('offline'))
  expect(await lookupChain(56)).toEqual({ error: 'Couldn’t reach chainlist.org' })
})

test('fetches the list once per session', async () => {
  await lookupChain(56)
  await lookupChain(56)
  expect(global.fetch).toHaveBeenCalledTimes(1)
})
