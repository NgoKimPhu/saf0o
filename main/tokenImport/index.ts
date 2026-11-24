import { discoverTokens, ALCHEMY_NETWORKS, type DiscoveryResult, type ImportCandidate } from './alchemy'

import type { ExplorerCredentialStatus } from '../contractVerification/credentialStorage'
import type { Token } from '../store/state/types/token'

type TokenRef = { chainId: number; address: string }

type CredentialStore = {
  load(): string | undefined
  remove(): ExplorerCredentialStatus
  save(apiKey: string): ExplorerCredentialStatus
  status(): ExplorerCredentialStatus
}

export type TokenImportDependencies = {
  credentialStore: CredentialStore
  discover?: (apiKey: string, account: string, chainIds: readonly number[]) => Promise<DiscoveryResult>
  enabledChainIds: () => number[]
  hasAccount: (address: string) => boolean
  // Tokens the wallet already scans for this account: default list, custom and known.
  isTracked: (account: string, token: TokenRef) => boolean
  // Tokens on the default list's blacklist (known spam).
  isBlocked: (token: TokenRef) => boolean
  saveTokens: (tokens: Token[]) => void
}

export type TokenImportError =
  'credential-unavailable' | 'discovery-failed' | 'invalid-request' | 'key-missing' | 'preview-expired'

type Result<T> = ({ success: true } & T) | { success: false; error: TokenImportError }

export type TokenImportPreview = {
  candidates: ImportCandidate[]
  // Enabled chains Alchemy has no network for.
  skippedChainIds: number[]
  failedChainIds: number[]
}

const MAX_SAVE = 200
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const idOf = (token: TokenRef) => `${token.chainId}:${token.address.toLowerCase()}`

export const createTokenImportService = (dependencies: TokenImportDependencies) => {
  const discover = dependencies.discover ?? discoverTokens
  // The last preview per account. Save reads token metadata from here, never from the renderer.
  const previews = new Map<string, Map<string, ImportCandidate>>()

  const credentialStatus = (): Result<{ credential: ExplorerCredentialStatus }> => {
    try {
      return { success: true, credential: dependencies.credentialStore.status() }
    } catch {
      return { success: false, error: 'credential-unavailable' }
    }
  }

  const saveCredential = (apiKey: unknown): Result<{ credential: ExplorerCredentialStatus }> => {
    if (typeof apiKey !== 'string') return { success: false, error: 'invalid-request' }
    try {
      return { success: true, credential: dependencies.credentialStore.save(apiKey) }
    } catch {
      return { success: false, error: 'credential-unavailable' }
    }
  }

  const removeCredential = (): Result<{ credential: ExplorerCredentialStatus }> => {
    try {
      return { success: true, credential: dependencies.credentialStore.remove() }
    } catch {
      return { success: false, error: 'credential-unavailable' }
    }
  }

  const preview = async (account: unknown): Promise<Result<TokenImportPreview>> => {
    if (typeof account !== 'string' || !ADDRESS.test(account) || !dependencies.hasAccount(account)) {
      return { success: false, error: 'invalid-request' }
    }
    const address = account.toLowerCase()

    let apiKey: string | undefined
    try {
      apiKey = dependencies.credentialStore.load()
    } catch {
      return { success: false, error: 'credential-unavailable' }
    }
    if (!apiKey) return { success: false, error: 'key-missing' }

    const enabled = dependencies.enabledChainIds()
    const supported = enabled.filter((id) => ALCHEMY_NETWORKS[id])
    const skippedChainIds = enabled.filter((id) => !ALCHEMY_NETWORKS[id])

    let found: DiscoveryResult
    try {
      found = await discover(apiKey, address, supported)
    } catch {
      return { success: false, error: 'discovery-failed' }
    }
    // Every chain failed: the key is wrong or Alchemy is down. Say so instead of an empty list.
    if (supported.length && found.failedChainIds.length >= supported.length && !found.candidates.length) {
      return { success: false, error: 'discovery-failed' }
    }

    const candidates = found.candidates.filter(
      (token) => !dependencies.isBlocked(token) && !dependencies.isTracked(address, token)
    )
    previews.set(address, new Map(candidates.map((token) => [idOf(token), token])))
    return { success: true, candidates, skippedChainIds, failedChainIds: found.failedChainIds }
  }

  const save = (account: unknown, selected: unknown): Result<{ saved: number }> => {
    if (typeof account !== 'string' || !ADDRESS.test(account))
      return { success: false, error: 'invalid-request' }
    if (!Array.isArray(selected) || !selected.length || selected.length > MAX_SAVE) {
      return { success: false, error: 'invalid-request' }
    }
    const cached = previews.get(account.toLowerCase())
    if (!cached) return { success: false, error: 'preview-expired' }

    const tokens: Token[] = []
    for (const ref of selected as TokenRef[]) {
      const candidate = cached.get(idOf(ref))
      if (!candidate) return { success: false, error: 'preview-expired' }
      const { chainId, address, name, symbol, decimals } = candidate
      tokens.push({ chainId, address, name, symbol, decimals, logoURI: '' })
    }
    dependencies.saveTokens(tokens)
    previews.delete(account.toLowerCase())
    return { success: true, saved: tokens.length }
  }

  return Object.freeze({ credentialStatus, preview, removeCredential, save, saveCredential })
}
