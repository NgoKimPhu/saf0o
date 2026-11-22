import path from 'path'
import electron from 'electron'
import Conf, { Options } from 'conf'

import migrations from '../migrate'
import { pruneTransientPersistedState, sanitizePersistedStateUpdate } from './state'

type PersistedConfig = Record<string, unknown>
type PersistOpts<T extends PersistedConfig> = Options<T>

const blockedSegments = new Set(['__proto__', 'prototype', 'constructor'])

// conf 16 (dot-prop 10) turns a numeric segment under a missing parent into an array index, so
// `main.__.77` or a chain id became an array. Missing parents here are always objects, as in dot-prop 6.
const setPath = (target: PersistedConfig, path: string, value: unknown) => {
  const segments = path.split('.')
  if (segments.some((segment) => blockedSegments.has(segment))) return
  const last = segments.pop() as string
  let node = target
  for (const segment of segments) {
    const child = node[segment]
    node = node[segment] = (child !== null && typeof child === 'object' ? child : {}) as PersistedConfig
  }
  node[last] = value
}

export class PersistStore extends Conf<PersistedConfig> {
  private blockUpdates = false
  private updates: PersistedConfig | null = {}

  constructor(options?: PersistOpts<PersistedConfig>) {
    options = { configFileMode: 0o600, configName: 'config', ...options }
    let defaultCwd = __dirname
    if (electron && electron.app) defaultCwd = electron.app.getPath('userData')
    if (options.cwd) {
      options.cwd = path.isAbsolute(options.cwd) ? options.cwd : path.join(defaultCwd, options.cwd)
    } else {
      options.cwd = defaultCwd
    }
    electron.app.on('quit', () => this.writeUpdates())
    super(options)
    setInterval(() => this.writeUpdates(), 30 * 1000)
  }

  writeUpdates() {
    if (this.blockUpdates) return

    const updates = { ...this.updates }
    this.updates = null
    if (Object.keys(updates || {}).length > 0) this.writePaths(updates)
  }

  private writePaths(updates: PersistedConfig) {
    const next = this.store
    for (const [path, value] of Object.entries(updates)) setPath(next, path, value)
    this.store = next
  }

  pruneTransientState() {
    const current = super.get('main')
    const pruned = pruneTransientPersistedState(current)
    if (pruned !== current) super.set('main', pruned)
  }

  queue(path: string, value: unknown) {
    const sanitized = sanitizePersistedStateUpdate(path, value)
    if (!sanitized) return
    path = `main.__.${migrations.latest}.${sanitized.path}`
    this.updates = this.updates || {}
    delete this.updates[path] // maintain entry order
    this.updates[path] = JSON.parse(JSON.stringify(sanitized.value))
  }

  override set(path: string | Partial<PersistedConfig>, value?: unknown) {
    if (this.blockUpdates) return
    if (typeof path !== 'string') throw new TypeError('Persisted state path must be a string')
    const sanitized = sanitizePersistedStateUpdate(path, value)
    if (!sanitized) return
    path = `main.__.${migrations.latest}.${sanitized.path}`
    this.writePaths({ [path]: sanitized.value })
  }

  override clear() {
    this.blockUpdates = true
    super.clear()
  }
}

const persist = new PersistStore()

type MainStateCommitTarget = Pick<PersistStore, 'set'>

export const commitMainState = (mainState: unknown, target: MainStateCommitTarget = persist) =>
  target.set('main', mainState)

export default persist
