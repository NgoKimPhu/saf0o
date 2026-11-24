// Predicts the next gas price on a chain without a fee market (Arbitrum, Fantom), where the base fee
// can rise before a transaction lands. Tracks the relative price change per block with two EWMAs:
// drift (trend) and variance (noise). The result is last * exp(horizon * rising drift), plus a buffer of
// k standard deviations. A flat or new history gets only the floor, the tiniest buffer.
const ALPHA = 0.3
const HORIZON_BLOCKS = 2
const K_SIGMA = 2
const FLOOR = 0.005
const CAP = 0.25
const SCALE = 1_000_000n

export class GasPricePredictor {
  private last = 0n
  private drift = 0
  private variance = 0

  // Records a block's gas price in wei and returns the price to use for the next transactions.
  next(sample: bigint): bigint {
    if (sample <= 0n) return sample

    if (this.last > 0n) {
      const change = Math.log(Number(sample) / Number(this.last))
      this.drift = ALPHA * change + (1 - ALPHA) * this.drift
      this.variance = ALPHA * (change - this.drift) ** 2 + (1 - ALPHA) * this.variance
    }
    this.last = sample

    const trend = Math.exp(HORIZON_BLOCKS * Math.max(this.drift, 0))
    const buffer = Math.min(CAP, Math.max(FLOOR, K_SIGMA * Math.sqrt(this.variance * HORIZON_BLOCKS)))
    const multiplier = Math.min(1 + CAP, trend * (1 + buffer))

    return (sample * BigInt(Math.round(multiplier * Number(SCALE)))) / SCALE
  }
}
