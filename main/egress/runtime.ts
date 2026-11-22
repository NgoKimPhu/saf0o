import { app, session } from 'electron'

import store from '../store'
import { NETWORK_PRESETS } from '../../resources/constants'
import { hostOf, installSessionGuard, setDynamicHosts } from '.'

import type { Chain } from '../store/state'

type Presets = Record<string, Record<string, string>>

function* runtimeHosts() {
  const presets = NETWORK_PRESETS.ethereum as Presets
  const chains = (store('main.networks.ethereum') || {}) as Record<string, Chain>
  for (const [id, chain] of Object.entries(chains)) {
    for (const endpoint of chain.connection?.endpoints || []) {
      if (endpoint.current === 'custom') yield hostOf(endpoint.custom)
    }
    for (const url of Object.values(presets[id] || {})) yield hostOf(url)
  }
  yield hostOf(store('main.latticeSettings.endpointCustom'))
  // IPFS endpoints the user set explicitly (main/nebula/ipfs.ts).
  for (const name of ['SAF0O_IPFS_GATEWAY_URL', 'SAF0O_IPFS_API_URL', 'FRAME_IPFS_API_URL'])
    yield hostOf(process.env[name])
}

// Side-effect import, placed right after the store so chain connections made at load time match.
setDynamicHosts(() => Array.from(runtimeHosts()).filter((host): host is string => !!host))
app.whenReady().then(() => installSessionGuard(session.defaultSession))
