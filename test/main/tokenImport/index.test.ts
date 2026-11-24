import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  createAlchemyApiKeyStore,
  createEtherscanApiKeyStore,
  type SafeStorageLike
} from '../../../main/contractVerification/credentialStorage'
import { discoverTokens, toCandidate } from '../../../main/tokenImport/alchemy'
import { createTokenImportService } from '../../../main/tokenImport'

const KEY = 'AbCdEf0123456789_alchemy_secret_key'
const ACCOUNT = '0x1111111111111111111111111111111111111111'
const TOKEN_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const slugs = new Map([
  ['eth-mainnet', 1],
  ['base-mainnet', 8453]
])

const entry = (over: Record<string, unknown> = {}) => ({
  network: 'eth-mainnet',
  tokenAddress: TOKEN_A,
  tokenBalance: '0x10',
  tokenMetadata: { decimals: 6, symbol: 'AAA', name: 'Token A' },
  ...over
})

const safeStorage = (): SafeStorageLike => {
  const key = crypto.randomBytes(32)
  return {
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true,
    encryptString: (text) => {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), body])
    },
    decryptString: (buf) => {
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
      d.setAuthTag(buf.subarray(12, 28))
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
    }
  }
}

const response = (body: unknown, status = 200) => ({ status, json: async () => body })

describe('toCandidate', () => {
  it('drops entries that must never be imported: native, zero balance, bad address, bad decimals', () => {
    expect(toCandidate(entry(), slugs)).toMatchObject({ chainId: 1, address: TOKEN_A, balance: '16' })
    expect(toCandidate(entry({ tokenAddress: null }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ tokenBalance: '0x0' }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ tokenAddress: '0x12' }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ network: 'unknown-mainnet' }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ tokenMetadata: { decimals: 1.5, symbol: 'X' } }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ tokenMetadata: { decimals: 255, symbol: 'X' } }), slugs)).toBeUndefined()
    expect(toCandidate(entry({ tokenMetadata: { decimals: 6 } }), slugs)).toBeUndefined()
  })

  it('strips control and bidi characters and caps length, since a scam token controls its own name', () => {
    const result = toCandidate(
      entry({ tokenMetadata: { decimals: 6, symbol: 'U‮SDC\u0007', name: 'x'.repeat(500) } }),
      slugs
    )
    expect(result?.symbol).toBe('USDC')
    expect(result?.name).toHaveLength(64)
  })
})

describe('discoverTokens', () => {
  it('follows pageKey, reports partial errors as failed chains, and keeps the other chains', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response({ data: { tokens: [entry()], pageKey: 'p2' } }))
      .mockResolvedValueOnce(
        response({
          data: { tokens: [entry({ tokenAddress: TOKEN_B })] },
          error: { partialErrors: [{ network: 'base-mainnet', message: 'boom' }] }
        })
      )

    const result = await discoverTokens(KEY, ACCOUNT, [1, 8453], fetchImpl)

    expect(result.candidates.map((c) => c.address)).toEqual([TOKEN_A, TOKEN_B])
    expect(result.failedChainIds).toEqual([8453])
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).pageKey).toBe('p2')
  })

  it('is not truncated when the last page has no pageKey', async () => {
    const result = await discoverTokens(KEY, ACCOUNT, [1], async () =>
      response({ data: { tokens: [entry()] } })
    )
    expect(result.truncated).toBe(false)
  })

  it('reports every chain of a request as failed on a bad status and does not leak the key', async () => {
    const result = await discoverTokens(KEY, ACCOUNT, [1, 8453], async () => response({}, 401))
    expect(result.candidates).toEqual([])
    expect(result.failedChainIds.sort()).toEqual([1, 8453])
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('stops paging at a bound so a hostile server cannot loop forever', async () => {
    const fetchImpl = jest.fn(async () => response({ data: { tokens: [], pageKey: 'again' } }))
    const result = await discoverTokens(KEY, ACCOUNT, [1], fetchImpl)
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(10)
    // The user must learn the list is incomplete instead of trusting a silent cut.
    expect(result.truncated).toBe(true)
  })
})

describe('token import service', () => {
  const candidates = [
    { chainId: 1, address: TOKEN_A, name: 'A', symbol: 'AAA', decimals: 6, balance: '5' },
    { chainId: 1, address: TOKEN_B, name: 'B', symbol: 'BBB', decimals: 18, balance: '7' }
  ]

  const build = (over: Record<string, unknown> = {}) => {
    const saveTokens = jest.fn()
    const discover = jest.fn(async () => ({ candidates, failedChainIds: [] as number[], truncated: false }))
    const service = createTokenImportService({
      credentialStore: { load: () => KEY, remove: jest.fn(), save: jest.fn(), status: jest.fn() } as never,
      discover,
      enabledChainIds: () => [1, 369],
      hasAccount: () => true,
      isTracked: () => false,
      isBlocked: () => false,
      saveTokens,
      ...over
    })
    return { service, saveTokens, discover }
  }

  it('hides tokens the wallet already tracks and known spam, so only new tokens are offered', async () => {
    const { service } = build({
      isTracked: (_: string, t: { address: string }) => t.address === TOKEN_A,
      isBlocked: (t: { address: string }) => t.address === TOKEN_B
    })
    const result = await service.preview(ACCOUNT)
    expect(result).toMatchObject({ success: true, candidates: [] })
  })

  it('queries only enabled chains Alchemy supports and reports the rest as skipped', async () => {
    const { service, discover } = build()
    const result = await service.preview(ACCOUNT)
    expect(discover).toHaveBeenCalledWith(KEY, ACCOUNT, [1])
    expect(result).toMatchObject({ success: true, skippedChainIds: [369], truncated: false })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('fails when the key is missing, the account is unknown, or every chain failed', async () => {
    expect(await build({ credentialStore: { load: () => undefined } }).service.preview(ACCOUNT)).toEqual({
      success: false,
      error: 'key-missing'
    })
    expect(await build({ hasAccount: () => false }).service.preview(ACCOUNT)).toEqual({
      success: false,
      error: 'invalid-request'
    })
    const allFailed = build({
      discover: async () => ({ candidates: [], failedChainIds: [1], truncated: false })
    })
    expect(await allFailed.service.preview(ACCOUNT)).toEqual({ success: false, error: 'discovery-failed' })
  })

  it('saves metadata from the last preview, never from the renderer, in one store call', async () => {
    const { service, saveTokens } = build()
    await service.preview(ACCOUNT)
    const tampered = [{ chainId: 1, address: TOKEN_A, symbol: 'EVIL', decimals: 99 }]

    expect(service.save(ACCOUNT, tampered)).toEqual({ success: true, saved: 1 })

    expect(saveTokens).toHaveBeenCalledTimes(1)
    expect(saveTokens).toHaveBeenCalledWith([
      { chainId: 1, address: TOKEN_A, name: 'A', symbol: 'AAA', decimals: 6, logoURI: '' }
    ])
  })

  it('rejects tokens that were not in the preview, and a second save of the same preview', async () => {
    const { service, saveTokens } = build()
    await service.preview(ACCOUNT)
    const stranger = { chainId: 1, address: '0xcccccccccccccccccccccccccccccccccccccccc' }
    expect(service.save(ACCOUNT, [stranger])).toEqual({ success: false, error: 'preview-expired' })
    expect(service.save(ACCOUNT, [{ chainId: 1, address: TOKEN_A }])).toMatchObject({ success: true })
    expect(service.save(ACCOUNT, [{ chainId: 1, address: TOKEN_A }])).toEqual({
      success: false,
      error: 'preview-expired'
    })
    expect(saveTokens).toHaveBeenCalledTimes(1)
  })
})

describe('Alchemy key store', () => {
  it('keeps its key apart from the Etherscan key in the same profile folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saf0o-alchemy-'))
    try {
      const storage = safeStorage()
      const alchemy = createAlchemyApiKeyStore(root, { safeStorage: storage })
      const etherscan = createEtherscanApiKeyStore(root, { safeStorage: storage })

      alchemy.save(KEY)

      expect(alchemy.load()).toBe(KEY)
      expect(etherscan.status().configured).toBe(false)
      expect(etherscan.load()).toBeUndefined()

      fs.copyFileSync(alchemy.credentialPath, etherscan.credentialPath)
      expect(() => etherscan.load()).toThrow()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses to save without an OS keyring, as on WSL', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saf0o-alchemy-'))
    try {
      const store = createAlchemyApiKeyStore(root, {
        safeStorage: { ...safeStorage(), isEncryptionAvailable: () => false }
      })
      expect(store.status()).toMatchObject({ available: false, configured: false })
      expect(() => store.save(KEY)).toThrow()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
