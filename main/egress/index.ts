import log from 'electron-log'

import { isLoopback, patchConnect } from './connect'

import type { Session } from 'electron'

// Outbound allowlist against exfiltration by a compromised dependency. In-process only: code that
// targets the guard can undo it or spawn a binary, and dns.resolve* queries pass. Use an OS firewall
// for hard enforcement. Default mode logs; SAF0O_EGRESS=enforce blocks.
export type EgressMode = 'log' | 'enforce'

export const egressMode = (): EgressMode => (process.env['SAF0O_EGRESS'] === 'enforce' ? 'enforce' : 'log')

const staticHosts = new Set([
  'api.etherscan.io',
  'api.geckoterminal.com',
  'api.github.com',
  'coins.llama.fi',
  'extension.blocksec.com',
  'ipfs.io',
  'signing.gridpl.us',
  'sourcify.dev',
  'tokens.uniswap.org'
])
const staticSuffixes = ['.publicnode.com']

let dynamicHosts: () => Iterable<string> = () => []
const reported = new Set<string>()

// Hosts known only at runtime (custom RPCs, a custom Lattice relay), read on each check.
export const setDynamicHosts = (hosts: () => Iterable<string>) => {
  dynamicHosts = hosts
}

export const hostOf = (url: unknown) => {
  if (typeof url !== 'string' || !url) return undefined
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase() || undefined
  } catch {
    return undefined
  }
}

export const isAllowedHost = (rawHost: string) => {
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase()
  if (isLoopback(host)) return true
  if (staticHosts.has(host) || staticSuffixes.some((suffix) => host.endsWith(suffix))) return true
  for (const allowed of dynamicHosts()) if (allowed === host) return true
  return false
}

// Logs host:port and source only, once per host. Paths can carry RPC keys or account data.
const permit = (host: string, port: unknown, source: string, mode: EgressMode) => {
  if (isAllowedHost(host)) return true
  const key = `${source} ${host}:${port ?? ''}`
  if (!reported.has(key)) {
    reported.add(key)
    log.warn(`egress ${mode === 'log' ? 'unlisted' : 'blocked'}: ${key}`)
  }
  return mode === 'log'
}

export const installNodeGuard = (mode: EgressMode = egressMode()) =>
  patchConnect((host: string, port: unknown) => permit(host, port, 'node', mode))

const networkProtocols = new Set(['http:', 'https:', 'ws:', 'wss:'])

// Covers the wallet renderers and electron.net in main. Dapp views use their own partitions.
export const installSessionGuard = (session: Session, mode: EgressMode = egressMode()) => {
  session.webRequest.onBeforeRequest((details, callback) => {
    let url: URL
    try {
      url = new URL(details.url)
    } catch {
      return callback({ cancel: mode !== 'log' })
    }
    if (!networkProtocols.has(url.protocol)) return callback({})
    callback({ cancel: !permit(url.hostname, url.port, 'chromium', mode) })
  })
}
