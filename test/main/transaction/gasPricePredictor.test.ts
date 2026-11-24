import { GasPricePredictor } from '../../../main/transaction/gasPricePredictor'

const GWEI = 1_000_000_000n
const feed = (series: bigint[]) => {
  const predictor = new GasPricePredictor()
  return series.map((price) => predictor.next(price))
}
const last = <T>(items: T[]) => items[items.length - 1] as T

// Why: a buffer must cover only the real risk. A calm chain pays the floor and no more, since every
// extra wei goes to the user's fee. A rising or noisy chain needs more than the last price, or the
// cap falls under the next base fee and the transaction fails.
describe('GasPricePredictor', () => {
  it('adds only the 0.5% floor for a flat or new history', () => {
    expect(feed([GWEI])).toEqual([(GWEI * 1005n) / 1000n])
    expect(last(feed(Array(20).fill(GWEI)))).toBe((GWEI * 1005n) / 1000n)
  })

  it('predicts above the floor buffer when the price keeps rising', () => {
    const rising = Array.from({ length: 12 }, (_, i) => GWEI + BigInt(i) * (GWEI / 20n))
    const flat = last(feed(Array(12).fill(last(rising))))

    expect(last(feed(rising))).toBeGreaterThan(flat)
  })

  it('buffers a volatile series more than a calm one around the same level', () => {
    const calm = Array.from({ length: 20 }, (_, i) => GWEI + BigInt(i % 2) * (GWEI / 200n))
    const volatile = Array.from({ length: 20 }, (_, i) => (i % 2 ? (GWEI * 13n) / 10n : GWEI))

    const calmPrice = last(feed(calm))
    const volatilePrice = last(feed(volatile))
    expect(Number(volatilePrice) / Number(last(volatile))).toBeGreaterThan(
      Number(calmPrice) / Number(last(calm))
    )
  })

  it('never returns less than the latest sample, even when the price falls', () => {
    const series = [10n * GWEI, 9n * GWEI, 7n * GWEI, 5n * GWEI, 4n * GWEI, 4n * GWEI]
    feed(series).forEach((predicted, i) => expect(predicted).toBeGreaterThanOrEqual(series[i] as bigint))
  })

  it('caps the prediction at 25% over the latest sample', () => {
    const spikes = [GWEI, 3n * GWEI, 9n * GWEI, 30n * GWEI, 100n * GWEI, 300n * GWEI]
    const predictions = feed(spikes)

    predictions.forEach((predicted, i) => {
      expect(predicted).toBeLessThanOrEqual(((spikes[i] as bigint) * 125n) / 100n)
    })
    expect(last(predictions)).toBe((300n * GWEI * 125n) / 100n)
  })

  it('passes a zero sample through without poisoning the history', () => {
    const predictor = new GasPricePredictor()
    expect(predictor.next(0n)).toBe(0n)
    expect(predictor.next(GWEI)).toBe((GWEI * 1005n) / 1000n)
  })
})
