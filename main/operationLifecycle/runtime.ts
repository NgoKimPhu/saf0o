import log from 'electron-log'

import { getBlockTimeMs } from '../chains/blockTime'
import ledger from './index'
import { operationLifecycleRpc } from './rpc'
import { OperationLifecycleReconciler, type OperationReconciliationObserver } from './reconciler'
import { observeOperationLifecycles, publishOperationLifecycleObservation } from './events'

const RECONCILIATION_INTERVAL_MS = 15_000
// A fast chain (Arbitrum, ~250 ms blocks) mines before the first check at submission, which finds no
// receipt yet. Without a quick retry the operation waits for the 15 s sweep and the UI stays on
// "Submitted". Retry once per block, using the cached block time of the chain, for the first 20 s.
const FALLBACK_RETRY_MS = 1_000
const MIN_RETRY_MS = 250
const MAX_RETRY_MS = 5_000
const FAST_RETRY_WINDOW_MS = 20_000

class OperationLifecycleRuntime {
  private timer: ReturnType<typeof setInterval> | undefined
  private running: Promise<void> | undefined
  private claimed = new Set<string>()
  private reconciler = new OperationLifecycleReconciler(
    ledger,
    operationLifecycleRpc,
    publishOperationLifecycleObservation
  )

  observe(observer: OperationReconciliationObserver) {
    return observeOperationLifecycles(observer)
  }

  claim(operationId: string) {
    this.claimed.add(operationId)
  }

  release(operationId: string) {
    this.claimed.delete(operationId)
  }

  private run() {
    if (this.running) return this.running
    this.running = Promise.all(
      ledger
        .listStored()
        .filter(({ id, kind }) => kind !== 'walletCalls' && !this.claimed.has(id))
        .map(({ id }) => this.reconciler.reconcile(id))
    )
      .then(() => undefined)
      .catch((error) => log.warn('Operation lifecycle reconciliation failed', error))
      .finally(() => {
        this.running = undefined
      })
    return this.running
  }

  start() {
    if (this.timer) return
    void this.run()
    this.timer = setInterval(() => void this.run(), RECONCILIATION_INTERVAL_MS)
    this.timer.unref?.()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async reconcile(operationId: string, startedAt = Date.now()) {
    if (this.claimed.has(operationId)) return undefined
    const operation = await this.reconciler.reconcile(operationId)
    if (
      operation &&
      ['submitted', 'reorged'].includes(operation.state) &&
      Date.now() - startedAt < FAST_RETRY_WINDOW_MS
    ) {
      const delay = Math.min(
        MAX_RETRY_MS,
        Math.max(MIN_RETRY_MS, getBlockTimeMs(operation.chainId) ?? FALLBACK_RETRY_MS)
      )
      const timer = setTimeout(() => {
        this.reconcile(operationId, startedAt).catch(() => {})
      }, delay)
      timer.unref?.()
    }
    return operation
  }
}

export const operationLifecycleRuntime = new OperationLifecycleRuntime()
export default operationLifecycleRuntime
