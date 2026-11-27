import { computeAddress, hashAuthorization, SigningKey, Transaction } from 'ethers'

import {
  createEip7702UpgradeRequest,
  inspectSignedEip7702UpgradeTransaction,
  parseEip7702UpgradeRequest,
  signEip7702RevokeRequest,
  createEip7702RevokeRequest,
  signEip7702UpgradeRequest
} from '../../../main/transaction/eip7702'

const PRIVATE_KEY = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
const AUTHORITY = computeAddress(new SigningKey(PRIVATE_KEY).publicKey)
const AMBIRE = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
const OTHER = '0x1111111111111111111111111111111111111111'
const fees = { gasLimit: 200_000n, maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }

const createRequest = () =>
  createEip7702UpgradeRequest({
    authority: AUTHORITY,
    chainId: 8453n,
    nonce: 7n,
    delegate: AMBIRE,
    data: '0xABCD',
    ...fees
  })

// An upgrade signature gives the delegate full control of the account and runs `data` as the
// account. Every field the user reviewed must survive into the signed transaction, and only an
// allowlisted delegate on a verified chain may be signed.
describe('EIP-7702 upgrade request', () => {
  it('builds a self-sent, zero-value request with the authorization nonce after the tx nonce', () => {
    expect(createRequest()).toMatchObject({
      kind: 'eip7702-upgrade-v1',
      type: '0x4',
      from: AUTHORITY,
      to: AUTHORITY,
      delegate: AMBIRE,
      chainId: '0x2105',
      nonce: '0x7',
      authorizationNonce: '0x8',
      expectedFinalNonce: '0x9',
      value: '0x0',
      data: '0xabcd'
    })
  })

  it.each([
    ['a delegate outside the allowlist', { delegate: OTHER }],
    ['the zero delegate', { delegate: '0x0000000000000000000000000000000000000000' }],
    ['an unverified chain', { chainId: '0xfa' }],
    ['the wildcard chain', { chainId: '0x0' }],
    ['another destination', { to: OTHER }],
    ['a value transfer', { value: '0x1' }],
    ['non-hex data', { data: '0xzz' }],
    ['an incorrect authorization nonce', { authorizationNonce: '0x7' }],
    ['gas below the intrinsic minimum', { gasLimit: '0xb3af' }],
    ['the revoke kind', { kind: 'eip7702-revoke-v1' }],
    ['an extra field', { extra: true }]
  ])('rejects %s', (_label, change) => {
    expect(() => parseEip7702UpgradeRequest({ ...createRequest(), ...change })).toThrow()
  })

  it('does not accept a revoke request as an upgrade', () => {
    const revoke = createEip7702RevokeRequest({ authority: AUTHORITY, chainId: 1n, nonce: 7n, ...fees })
    expect(() => parseEip7702UpgradeRequest(revoke)).toThrow()
    expect(signEip7702RevokeRequest(PRIVATE_KEY, revoke)).toMatch(/^0x04/)
  })
})

describe('EIP-7702 upgrade signing', () => {
  it('signs one authorization to the reviewed delegate and carries the reviewed call data', () => {
    const request = createRequest()
    const rawTransaction = signEip7702UpgradeRequest(PRIVATE_KEY, request)
    const parsed = Transaction.from(rawTransaction)

    expect(inspectSignedEip7702UpgradeTransaction(rawTransaction, request).transactionHash).toBe(parsed.hash)
    expect(parsed.data).toBe('0xabcd')
    expect(parsed.to).toBe(AUTHORITY)
    expect(parsed.authorizationList).toHaveLength(1)
    expect(parsed.authorizationList?.[0]).toMatchObject({ address: AMBIRE, chainId: 8453n, nonce: 8n })
  })

  it('refuses to sign for a delegate outside the allowlist even if the caller skips parsing', () => {
    expect(() => signEip7702UpgradeRequest(PRIVATE_KEY, { ...createRequest(), delegate: OTHER })).toThrow(
      'not allowed'
    )
  })

  it('rejects a key that does not control the authority', () => {
    const otherKey = '0x8b3a350cf5c34c9194ca3a545d3b1952cdd34e2f29693a0a9dd67d22a51e58b0'
    expect(() => signEip7702UpgradeRequest(otherKey, createRequest())).toThrow('does not control')
  })

  it('rejects a signed transaction whose authorization names another delegate', () => {
    const request = createRequest()
    const key = new SigningKey(PRIVATE_KEY)
    const authorization = { address: OTHER, chainId: 8453n, nonce: 8n }
    const forged = Transaction.from({
      type: 4,
      chainId: 8453n,
      nonce: 7,
      to: AUTHORITY,
      value: 0n,
      data: request.data,
      gasLimit: 200_000n,
      maxFeePerGas: 3_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      authorizationList: [{ ...authorization, signature: key.sign(hashAuthorization(authorization)) }]
    })
    forged.signature = key.sign(forged.unsignedHash)

    expect(() => inspectSignedEip7702UpgradeTransaction(forged.serialized, request)).toThrow('does not match')
  })

  it('rejects a signed transaction against changed call data', () => {
    const request = createRequest()
    const rawTransaction = signEip7702UpgradeRequest(PRIVATE_KEY, request)
    expect(() =>
      inspectSignedEip7702UpgradeTransaction(rawTransaction, { ...request, data: '0xabce' })
    ).toThrow('does not match')
  })
})
