import log from 'electron-log'

import ledger from './index'
import { operationLifecycleRpc } from './rpc'
import { OperationLifecycleReconciler, type OperationReconciliationObserver } from './reconciler'
import { observeOperationLifecycles, publishOperationLifecycleObservation } from './events'

const RECONCILIATION_INTERVAL_MS = 15_000
// A fast chain (Arbitrum, ~250 ms blocks) mines before the first check at submission, which finds no
// receipt yet. Without a quick retry the operation waits for the 15 s sweep and the UI stays on
// "Submitted". Retry every second for the first 20 s, then leave it to the sweep.
const FAST_RETRY_MS = 1_000
const FAST_RETRIES = 20

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

  async reconcile(operationId: string, attempt = 0) {
    if (this.claimed.has(operationId)) return undefined
    const operation = await this.reconciler.reconcile(operationId)
    if (operation && ['submitted', 'reorged'].includes(operation.state) && attempt < FAST_RETRIES) {
      const timer = setTimeout(() => {
        this.reconcile(operationId, attempt + 1).catch(() => {})
      }, FAST_RETRY_MS)
      timer.unref?.()
    }
    return operation
  }
}

export const operationLifecycleRuntime = new OperationLifecycleRuntime()
export default operationLifecycleRuntime
