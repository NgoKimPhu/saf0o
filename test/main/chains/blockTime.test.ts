import { getBlockTimeMs, recordBlock, resetBlockTimes } from '../../../main/chains/blockTime'

beforeEach(resetBlockTimes)

it('has no value before a span has been measured', () => {
  expect(getBlockTimeMs(1)).toBeUndefined()
  recordBlock(1, 100, 1000)
  recordBlock(1, 101, 1002)
  expect(getBlockTimeMs(1)).toBeUndefined()
})

// Arbitrum mines several blocks per second but headers carry whole seconds, so only a long span
// gives the real value. Per-block deltas would read 0 or 1000 ms.
it('averages over a span of blocks and not per block', () => {
  recordBlock(42161, 1000, 5000)
  for (let n = 1001; n <= 1040; n++) recordBlock(42161, n, 5000 + Math.floor((n - 1000) / 4))
  expect(getBlockTimeMs(42161)).toBe(250)
})

it('smooths new samples into the previous value', () => {
  recordBlock(1, 0, 0)
  recordBlock(1, 1, 12)
  expect(getBlockTimeMs(1)).toBe(12000)
  recordBlock(1, 2, 22)
  expect(getBlockTimeMs(1)).toBeCloseTo(0.3 * 10000 + 0.7 * 12000)
})

it('keeps chains apart and resets when the block number goes backwards', () => {
  recordBlock(1, 0, 0)
  recordBlock(1, 1, 12)
  recordBlock(10, 0, 0)
  recordBlock(10, 50, 100)
  expect(getBlockTimeMs(10)).toBe(2000)
  recordBlock(1, 0, 24)
  expect(getBlockTimeMs(1)).toBeUndefined()
})
