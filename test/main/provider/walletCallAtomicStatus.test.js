import { keccak256 } from 'ethereum-cryptography/keccak'
import { bytesToHex, hexToBytes } from 'ethereum-cryptography/utils'

import { OperationLifecycleLedger } from '../../../main/operationLifecycle/ledger'
import { WalletCallBatchLedger } from '../../../main/provider/walletCallBatches'
import { admitWalletCallBatch } from '../../../main/provider/walletCallAdmission'
import { executeWalletCallBatch } from '../../../main/provider/walletCallExecution'

// The runtime under test wires these singletons; swap in memory-backed ledgers and a fake chain.
const memory = () => {
  let value = {}
  return {
    load: () => JSON.parse(JSON.stringify(value)),
    save: (next) => (value = JSON.parse(JSON.stringify(next)))
  }
}
const mockOperations = new OperationLifecycleLedger(memory())
const mockBatches = new WalletCallBatchLedger(memory(), mockOperations)
const PUBLICNODE_REFUSAL =
  'Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode'
// Behaves like keyless publicnode on Arbitrum (probed 2026-11-27): eth_getTransactionReceipt is refused
// as an "archive request", while tx-by-hash, blocks and eth_getBlockReceipts still answer.
const mockChain = { receipts: {}, latest: '0x1f780760', blockReceipts: true }

jest.mock('../../../main/operationLifecycle', () => ({ __esModule: true, default: mockOperations }))
jest.mock('../../../main/provider/walletCallLedger', () => ({ __esModule: true, default: mockBatches }))
jest.mock('../../../main/operationLifecycle/events', () => ({
  publishOperationLifecycleObservation: () => {}
}))
jest.mock('../../../main/chains', () => ({
  __esModule: true,
  default: {
    send: (payload, cb) => {
      const [param] = payload.params
      const mined = Object.values(mockChain.receipts)
      const answer = (body) => setImmediate(() => cb({ id: payload.id, jsonrpc: payload.jsonrpc, ...body }))
      if (payload.method === 'eth_getTransactionReceipt') {
        return answer({ error: { code: -32602, message: PUBLICNODE_REFUSAL } })
      }
      if (payload.method === 'eth_getBlockReceipts') {
        if (!mockChain.blockReceipts) return answer({ error: { code: -32601, message: 'method not found' } })
        return answer({ result: mined.filter((receipt) => receipt.blockHash === param) })
      }
      if (payload.method === 'eth_getTransactionByHash') {
        const receipt = mockChain.receipts[param]
        return answer({
          result: receipt
            ? { hash: param, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber }
            : null
        })
      }
      if (param === 'latest')
        return answer({ result: { number: mockChain.latest, hash: `0x${'c'.repeat(64)}` } })
      if (param === 'finalized') return answer({ result: null })
      return answer({ result: { number: param, hash: `0x${'b'.repeat(64)}` } })
    }
  }
}))

const account = '0x6cc4062ec8c99ad0480122b6a8a83381be5948ff'
const origin = 'dapp.test'
const rawTransaction = '0x04f8aa'

// Mirrors the mined Arbitrum receipt: type 0x4, L1 extras, logs carrying block metadata.
const arbitrumReceipt = (transactionHash, status = '0x1') => ({
  blockHash: `0x${'b'.repeat(64)}`,
  blockNumber: '0x1f780754',
  contractAddress: null,
  cumulativeGasUsed: '0x5a1b2',
  effectiveGasPrice: '0x131aa00',
  from: account,
  gasUsed: '0x4617f',
  gasUsedForL1: '0x0',
  l1BlockNumber: '0x16a1b2c',
  logs: [],
  logsBloom: `0x${'0'.repeat(512)}`,
  status,
  timeboosted: false,
  to: account,
  transactionHash,
  transactionIndex: '0x1',
  type: '0x4'
})

// Polls run on real timers; wait for the status to leave 100, bounded so a stuck batch fails.
const settledStatus = async (id) => {
  const deadline = Date.now() + 2000
  let status = mockBatches.getStatus(origin, account, id)
  while (status.status === 100 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    status = mockBatches.getStatus(origin, account, id)
  }
  return status
}

let submitted = 0
async function submit(calls, atomic) {
  submitted += 1
  const admitted = admitWalletCallBatch(
    {
      handlerId: `h-${submitted}`,
      origin,
      account,
      atomic,
      payload: {
        method: 'wallet_sendCalls',
        params: [
          { version: '2.0.0', from: account, chainId: '0xa4b1', atomicRequired: Boolean(atomic), calls }
        ]
      }
    },
    { ledger: mockBatches, addRequest: () => true }
  )
  const executionCalls = atomic ? [{ to: account, data: '0x', value: '0x0' }] : calls
  const raws = executionCalls.map(
    (_, index) =>
      `${rawTransaction}${submitted.toString(16).padStart(2, '0')}${index.toString(16).padStart(2, '0')}`
  )
  const hashes = await executeWalletCallBatch(
    { id: admitted.id, origin, account, calls: executionCalls },
    {
      ledger: mockBatches,
      signCall: async (_call, index) => ({ rawTransaction: raws[index] }),
      broadcast: async (raw) => `0x${bytesToHex(keccak256(hexToBytes(raw.slice(2))))}`
    }
  )
  return { id: admitted.id, hashes }
}

const call = (to) => ({ to, data: '0x', value: '0x0' })
const target = (n) => `0x${String(n).repeat(40)}`

let runtime
let warn
beforeAll(() => {
  warn = jest.spyOn(require('electron-log'), 'warn').mockImplementation(() => {})
  jest.useRealTimers()
  runtime = require('../../../main/provider/walletCallEvidenceRuntime').default
})
afterEach(() => {
  runtime.stop()
  mockChain.blockReceipts = true
})

it('reports a mined atomic batch as 200 with its receipt once evidence is polled', async () => {
  const { id, hashes } = await submit([call(target(1)), call(target(2))], 'upgrade')
  expect(hashes).toHaveLength(1)
  mockChain.receipts[hashes[0]] = arbitrumReceipt(hashes[0])

  runtime.start()
  const status = await settledStatus(id)
  expect(status).toMatchObject({ status: 200, atomic: true })
  expect(status.receipts).toHaveLength(1)
  expect(status.receipts[0].transactionHash).toBe(hashes[0])
})

// Non-atomic batches share the path: one receipt per call, settled at 200, 500 or 600.
it.each([
  [['0x1', '0x1'], 200],
  [['0x0', '0x0'], 500],
  [['0x1', '0x0'], 600]
])('settles a sequential batch with receipt statuses %p as %p', async (statuses, expected) => {
  const { id, hashes } = await submit([call(target(3)), call(target(4))], false)
  hashes.forEach((hash, index) => (mockChain.receipts[hash] = arbitrumReceipt(hash, statuses[index])))

  runtime.start()
  const status = await settledStatus(id)
  expect(status).toMatchObject({ status: expected, atomic: false })
  expect(status.receipts).toHaveLength(2)
})

// Without any receipt source the batch stays pending, and the log names the RPC as the cause.
it('logs that the RPC refused receipts when the block-receipt fallback also fails', async () => {
  mockChain.blockReceipts = false
  const { id, hashes } = await submit([call(target(5)), call(target(6))], 'upgrade')
  mockChain.receipts[hashes[0]] = arbitrumReceipt(hashes[0])

  runtime.start()
  expect((await settledStatus(id)).status).toBe(100)
  const message = warn.mock.calls.map(([, error]) => String(error?.message)).join('\n')
  expect(message).toContain(
    'Chain 42161 RPC refused the receipt lookup (Archive requests require a personal token'
  )
  expect(message).toContain('Add an RPC that serves transaction receipts.')
})
