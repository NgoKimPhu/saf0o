import { app, safeStorage } from 'electron'
import path from 'path'

import store from '../store'
import { requireStoreAction } from '../store/action'
import { createAlchemyApiKeyStore, type SafeStorageLike } from '../contractVerification/credentialStorage'
import TokenLoader from '../externalData/inventory/tokens'
import { toTokenId } from '../../resources/domain/balance'
import { createTokenImportService } from '.'

import type { Token } from '../store/state/types/token'

const unavailableSafeStorage: SafeStorageLike = {
  decryptString: () => {
    throw new Error('OS keychain is unavailable')
  },
  encryptString: () => {
    throw new Error('OS keychain is unavailable')
  },
  getSelectedStorageBackend: () => 'unknown',
  isEncryptionAvailable: () => false
}

const userData = app?.getPath
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main?.filename || process.cwd()), '../.userData')

const tokenLoader = new TokenLoader()

export const tokenImportCredentialStore = createAlchemyApiKeyStore(userData, {
  safeStorage: (safeStorage as SafeStorageLike | undefined) || unavailableSafeStorage
})

const tokenImport = createTokenImportService({
  credentialStore: tokenImportCredentialStore,
  enabledChainIds: () =>
    Object.entries((store('main.networks.ethereum') || {}) as Record<string, { on?: boolean }>)
      .filter(([, network]) => network?.on === true)
      .map(([id]) => Number(id)),
  hasAccount: (address) => Boolean(store('main.accounts', address.toLowerCase())),
  isTracked: (account, token) => {
    const id = toTokenId(token)
    const lists = [
      tokenLoader.getTokens([token.chainId]),
      (store('main.tokens.custom') || []) as Token[],
      (store('main.tokens.known', account) || []) as Token[]
    ]
    return lists.some((list) => list.some((t) => toTokenId(t) === id))
  },
  isBlocked: (token) => {
    const id = toTokenId(token)
    return tokenLoader.getBlacklist([token.chainId]).some((t) => toTokenId(t) === id)
  },
  saveTokens: (tokens) => requireStoreAction('addCustomTokens')(tokens)
})

export default tokenImport
