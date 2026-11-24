import runtime from '../../../main/operationLifecycle/runtime'
import { recordBlock, resetBlockTimes } from '../../../main/chains/blockTime'
import { OperationLifecycleReconciler } from '../../../main/operationLifecycle/reconciler'

jest.mock('../../../main/operationLifecycle/index', () => ({ __esModule: true, default: {} }))
jest.mock('../../../main/operationLifecycle/rpc', () => ({ operationLifecycleRpc: jest.fn() }))

const reconcile = jest.spyOn(OperationLifecycleReconciler.prototype, 'reconcile')

beforeEach(() => {
  jest.useFakeTimers()
  reconcile.mockReset()
  resetBlockTimes()
})
afterEach(() => jest.useRealTimers())

// Arbitrum mines in ~100 ms, before the submission-time check can see a receipt. The row must flip to
// confirmed within seconds, not wait for the 15 s sweep, or the UI sits on "Submitted".
it('rechecks a submitted operation every second without a block time sample until the receipt appears', async () => {
  reconcile
    .mockResolvedValueOnce({ id: 'op', chainId: 1, state: 'submitted' } as never)
    .mockResolvedValueOnce({ id: 'op', chainId: 1, state: 'submitted' } as never)
    .mockResolvedValueOnce({ id: 'op', chainId: 1, state: 'confirmed' } as never)

  await runtime.reconcile('op')
  expect(reconcile).toHaveBeenCalledTimes(1)

  await jest.advanceTimersByTimeAsync(1000)
  expect(reconcile).toHaveBeenCalledTimes(2)
  await jest.advanceTimersByTimeAsync(1000)
  expect(reconcile).toHaveBeenCalledTimes(3)

  // A terminal state stops the chain.
  await jest.advanceTimersByTimeAsync(5000)
  expect(reconcile).toHaveBeenCalledTimes(3)
})

// A 250 ms chain must be rechecked every block, and a 12 s chain must not be polled every second.
// Both would be wrong if the delay ignored the cached block time.
it('paces rechecks by the cached block time of the operation chain', async () => {
  recordBlock(42161, 0, 0)
  recordBlock(42161, 40, 10)
  reconcile.mockResolvedValue({ id: 'op', chainId: 42161, state: 'submitted' } as never)

  await runtime.reconcile('op')
  await jest.advanceTimersByTimeAsync(250)
  expect(reconcile).toHaveBeenCalledTimes(2)
  await jest.advanceTimersByTimeAsync(250)
  expect(reconcile).toHaveBeenCalledTimes(3)
})

it('does not poll a 12 s chain every second', async () => {
  recordBlock(1, 0, 0)
  recordBlock(1, 1, 12)
  reconcile.mockResolvedValue({ id: 'op2', chainId: 1, state: 'submitted' } as never)
  await runtime.reconcile('op2')
  await jest.advanceTimersByTimeAsync(4999)
  expect(reconcile).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  expect(reconcile).toHaveBeenCalledTimes(2)
})

it('stops rechecking after about 20 seconds', async () => {
  reconcile.mockResolvedValue({ id: 'op', chainId: 1, state: 'submitted' } as never)
  await runtime.reconcile('op')
  await jest.advanceTimersByTimeAsync(20_000)
  const calls = reconcile.mock.calls.length
  await jest.advanceTimersByTimeAsync(10_000)
  expect(reconcile).toHaveBeenCalledTimes(calls)
})
