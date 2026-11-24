import runtime from '../../../main/operationLifecycle/runtime'
import { OperationLifecycleReconciler } from '../../../main/operationLifecycle/reconciler'

jest.mock('../../../main/operationLifecycle/index', () => ({ __esModule: true, default: {} }))
jest.mock('../../../main/operationLifecycle/rpc', () => ({ operationLifecycleRpc: jest.fn() }))

const reconcile = jest.spyOn(OperationLifecycleReconciler.prototype, 'reconcile')

beforeEach(() => {
  jest.useFakeTimers()
  reconcile.mockReset()
})
afterEach(() => jest.useRealTimers())

// Arbitrum mines in ~100 ms, before the submission-time check can see a receipt. The row must flip to
// confirmed within seconds, not wait for the 15 s sweep, or the UI sits on "Submitted".
it('rechecks a submitted operation every second until the receipt appears', async () => {
  reconcile
    .mockResolvedValueOnce({ id: 'op', state: 'submitted' } as never)
    .mockResolvedValueOnce({ id: 'op', state: 'submitted' } as never)
    .mockResolvedValueOnce({ id: 'op', state: 'confirmed' } as never)

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
