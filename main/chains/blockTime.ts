// Smoothed block time per chain, in memory only: a few blocks refill it after a restart.
// Headers carry whole seconds and Arbitrum mines several blocks per second, so a single block delta
// is useless. Measure over a span of at least MIN_SPAN_S, which keeps the 1 s rounding under ~10%.
const MIN_SPAN_S = 10
const EWMA_WEIGHT = 0.3

interface Entry {
  number: number
  timestamp: number
  ms?: number
}

const chains = new Map<number, Entry>()

export function recordBlock(chainId: number, number: number, timestamp: number) {
  if (![chainId, number, timestamp].every(Number.isFinite)) return
  const entry = chains.get(chainId)
  // A lower number is a reorg or an endpoint switch: drop the history and start over.
  if (!entry || number < entry.number || timestamp < entry.timestamp) {
    chains.set(chainId, { number, timestamp })
    return
  }
  const span = timestamp - entry.timestamp
  if (number === entry.number || span < MIN_SPAN_S) return

  const sample = (span * 1000) / (number - entry.number)
  chains.set(chainId, {
    number,
    timestamp,
    ms: entry.ms === undefined ? sample : EWMA_WEIGHT * sample + (1 - EWMA_WEIGHT) * entry.ms
  })
}

export function getBlockTimeMs(chainId: number) {
  return chains.get(chainId)?.ms
}

export function resetBlockTimes() {
  chains.clear()
}
