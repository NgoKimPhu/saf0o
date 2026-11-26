import {
  computeAddress,
  getAddress,
  hashAuthorization,
  SigningKey,
  Transaction,
  verifyAuthorization
} from 'ethers'

import { parseRpcQuantity, toRpcQuantity } from '../../resources/domain/transaction/quantity'
import { isAllowedDelegate } from '../eip7702/delegates'

export const EIP7702_REVOKE_KIND = 'eip7702-revoke-v1' as const
export const EIP7702_TRANSACTION_TYPE = '0x4' as const
export const EIP7702_REVOKE_DELEGATE = '0x0000000000000000000000000000000000000000' as const
export const EIP7702_REVOKE_INTRINSIC_GAS = 46_000n

const MAX_ACCOUNT_NONCE = BigInt(Number.MAX_SAFE_INTEGER)
const REQUEST_KEYS = Object.freeze([
  'authority',
  'authorizationNonce',
  'chainId',
  'data',
  'delegate',
  'expectedFinalNonce',
  'from',
  'gasLimit',
  'kind',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'nonce',
  'to',
  'type',
  'value'
] as const)

export type Eip7702RevokeRequest = Readonly<{
  kind: typeof EIP7702_REVOKE_KIND
  type: typeof EIP7702_TRANSACTION_TYPE
  authority: string
  from: string
  to: string
  delegate: typeof EIP7702_REVOKE_DELEGATE
  chainId: string
  nonce: string
  authorizationNonce: string
  expectedFinalNonce: string
  value: '0x0'
  data: '0x'
  gasLimit: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
}>

export type CreateEip7702RevokeRequest = Readonly<{
  authority: string
  chainId: bigint
  nonce: bigint
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}>

export type InspectedEip7702RevokeTransaction = Readonly<{
  authority: string
  chainId: string
  nonce: string
  authorizationNonce: string
  expectedFinalNonce: string
  transactionHash: string
}>

function canonicalAddress(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid EIP-7702 ${field}`)

  try {
    return getAddress(value)
  } catch {
    throw new Error(`Invalid EIP-7702 ${field}`)
  }
}

function canonicalQuantity(value: unknown, field: string): bigint {
  const parsed = parseRpcQuantity(value)
  if (parsed === undefined || toRpcQuantity(parsed) !== value) {
    throw new Error(`Invalid EIP-7702 ${field}`)
  }
  return parsed
}

function assertExactRequestKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value).sort()
  const expected = [...REQUEST_KEYS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('Invalid EIP-7702 revoke request shape')
  }
}

export function parseEip7702RevokeRequest(value: unknown): Eip7702RevokeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid EIP-7702 revoke request')
  }

  const request = value as Record<string, unknown>
  assertExactRequestKeys(request)

  if (request['kind'] !== EIP7702_REVOKE_KIND || request['type'] !== EIP7702_TRANSACTION_TYPE) {
    throw new Error('Invalid EIP-7702 revoke transaction type')
  }
  if (request['delegate'] !== EIP7702_REVOKE_DELEGATE) {
    throw new Error('EIP-7702 revoke delegate must be the zero address')
  }
  if (request['value'] !== '0x0' || request['data'] !== '0x') {
    throw new Error('EIP-7702 revoke transaction cannot transfer value or data')
  }

  const authority = canonicalAddress(request['authority'], 'authority')
  const from = canonicalAddress(request['from'], 'from address')
  const to = canonicalAddress(request['to'], 'to address')
  if (from !== authority || to !== authority) {
    throw new Error('EIP-7702 revoke transaction must be self-funded by its authority')
  }

  const chainId = canonicalQuantity(request['chainId'], 'chain ID')
  const nonce = canonicalQuantity(request['nonce'], 'transaction nonce')
  const authorizationNonce = canonicalQuantity(request['authorizationNonce'], 'authorization nonce')
  const expectedFinalNonce = canonicalQuantity(request['expectedFinalNonce'], 'final nonce')
  const gasLimit = canonicalQuantity(request['gasLimit'], 'gas limit')
  const maxFeePerGas = canonicalQuantity(request['maxFeePerGas'], 'maximum fee')
  const maxPriorityFeePerGas = canonicalQuantity(request['maxPriorityFeePerGas'], 'priority fee')

  if (chainId === 0n) throw new Error('EIP-7702 revoke chain ID must be nonzero')
  if (nonce > MAX_ACCOUNT_NONCE - 2n) throw new Error('EIP-7702 revoke nonce is too large')
  if (authorizationNonce !== nonce + 1n || expectedFinalNonce !== nonce + 2n) {
    throw new Error('EIP-7702 revoke nonce contract is invalid')
  }
  if (gasLimit < EIP7702_REVOKE_INTRINSIC_GAS || maxFeePerGas === 0n || maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error('EIP-7702 revoke fee fields are invalid')
  }

  return Object.freeze({
    kind: EIP7702_REVOKE_KIND,
    type: EIP7702_TRANSACTION_TYPE,
    authority,
    from,
    to,
    delegate: EIP7702_REVOKE_DELEGATE,
    chainId: toRpcQuantity(chainId),
    nonce: toRpcQuantity(nonce),
    authorizationNonce: toRpcQuantity(authorizationNonce),
    expectedFinalNonce: toRpcQuantity(expectedFinalNonce),
    value: '0x0',
    data: '0x',
    gasLimit: toRpcQuantity(gasLimit),
    maxFeePerGas: toRpcQuantity(maxFeePerGas),
    maxPriorityFeePerGas: toRpcQuantity(maxPriorityFeePerGas)
  })
}

export function createEip7702RevokeRequest(input: CreateEip7702RevokeRequest): Eip7702RevokeRequest {
  const authority = canonicalAddress(input.authority, 'authority')

  return parseEip7702RevokeRequest({
    kind: EIP7702_REVOKE_KIND,
    type: EIP7702_TRANSACTION_TYPE,
    authority,
    from: authority,
    to: authority,
    delegate: EIP7702_REVOKE_DELEGATE,
    chainId: toRpcQuantity(input.chainId),
    nonce: toRpcQuantity(input.nonce),
    authorizationNonce: toRpcQuantity(input.nonce + 1n),
    expectedFinalNonce: toRpcQuantity(input.nonce + 2n),
    value: '0x0',
    data: '0x',
    gasLimit: toRpcQuantity(input.gasLimit),
    maxFeePerGas: toRpcQuantity(input.maxFeePerGas),
    maxPriorityFeePerGas: toRpcQuantity(input.maxPriorityFeePerGas)
  })
}

export function signEip7702RevokeRequest(privateKey: string | Uint8Array, value: unknown): string {
  const request = parseEip7702RevokeRequest(value)
  const signingKey = new SigningKey(privateKey)
  if (canonicalAddress(computeAddress(signingKey.publicKey), 'signer address') !== request.authority) {
    throw new Error('EIP-7702 revoke signer does not control the authority')
  }

  const authorization = {
    address: request.delegate,
    chainId: BigInt(request.chainId),
    nonce: BigInt(request.authorizationNonce)
  }
  const authorizationSignature = signingKey.sign(hashAuthorization(authorization))
  const transaction = Transaction.from({
    type: 4,
    chainId: BigInt(request.chainId),
    nonce: Number(BigInt(request.nonce)),
    to: request.to,
    value: 0n,
    data: '0x',
    gasLimit: BigInt(request.gasLimit),
    maxFeePerGas: BigInt(request.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(request.maxPriorityFeePerGas),
    authorizationList: [{ ...authorization, signature: authorizationSignature }]
  })
  transaction.signature = signingKey.sign(transaction.unsignedHash)
  const serialized = transaction.serialized

  inspectSignedEip7702RevokeTransaction(serialized, request)
  return serialized
}

export function inspectSignedEip7702RevokeTransaction(
  rawTransaction: unknown,
  expectedRequest: unknown
): InspectedEip7702RevokeTransaction {
  if (
    typeof rawTransaction !== 'string' ||
    rawTransaction.length > 8194 ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(rawTransaction)
  ) {
    throw new Error('Invalid signed EIP-7702 revoke transaction')
  }
  const request = parseEip7702RevokeRequest(expectedRequest)

  let transaction: Transaction
  try {
    transaction = Transaction.from(rawTransaction)
  } catch {
    throw new Error('Invalid signed EIP-7702 revoke transaction')
  }

  if (!transaction.signature || !transaction.hash || transaction.type !== 4) {
    throw new Error('Invalid signed EIP-7702 revoke transaction')
  }
  if (
    canonicalAddress(transaction.from, 'transaction signer') !== request.authority ||
    transaction.chainId !== BigInt(request.chainId) ||
    transaction.nonce !== Number(BigInt(request.nonce)) ||
    canonicalAddress(transaction.to, 'transaction destination') !== request.to ||
    transaction.value !== 0n ||
    transaction.data !== '0x' ||
    transaction.gasLimit !== BigInt(request.gasLimit) ||
    transaction.maxFeePerGas !== BigInt(request.maxFeePerGas) ||
    transaction.maxPriorityFeePerGas !== BigInt(request.maxPriorityFeePerGas) ||
    (transaction.accessList?.length ?? 0) !== 0
  ) {
    throw new Error('Signed EIP-7702 transaction does not match the revoke request')
  }

  const authorizations = transaction.authorizationList
  if (!authorizations || authorizations.length !== 1) {
    throw new Error('EIP-7702 revoke transaction must contain one authorization')
  }
  const authorization = authorizations[0]
  if (
    !authorization ||
    canonicalAddress(authorization.address, 'delegate') !== EIP7702_REVOKE_DELEGATE ||
    authorization.chainId !== BigInt(request.chainId) ||
    authorization.nonce !== BigInt(request.authorizationNonce) ||
    canonicalAddress(
      verifyAuthorization(
        {
          address: authorization.address,
          chainId: authorization.chainId,
          nonce: authorization.nonce
        },
        authorization.signature
      ),
      'authorization signer'
    ) !== request.authority
  ) {
    throw new Error('Signed EIP-7702 authorization does not match the revoke request')
  }

  return Object.freeze({
    authority: request.authority,
    chainId: request.chainId,
    nonce: request.nonce,
    authorizationNonce: request.authorizationNonce,
    expectedFinalNonce: request.expectedFinalNonce,
    transactionHash: transaction.hash
  })
}

// Upgrade: a self-sent type-4 tx that delegates the authority to an allowlisted contract and
// calls it with `data` (for example a batch) in the same transaction.
export const EIP7702_UPGRADE_KIND = 'eip7702-upgrade-v1' as const
const MAX_UPGRADE_DATA_BYTES = 128 * 1024

export type Eip7702UpgradeRequest = Readonly<
  Omit<Eip7702RevokeRequest, 'kind' | 'delegate' | 'data'> & {
    kind: typeof EIP7702_UPGRADE_KIND
    delegate: string
    data: string
  }
>

export type CreateEip7702UpgradeRequest = CreateEip7702RevokeRequest &
  Readonly<{ delegate: string; data: string }>

export function parseEip7702UpgradeRequest(value: unknown): Eip7702UpgradeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid EIP-7702 upgrade request')
  }
  const request = value as Record<string, unknown>
  if (Object.keys(request).sort().join() !== [...REQUEST_KEYS].sort().join()) {
    throw new Error('Invalid EIP-7702 upgrade request shape')
  }
  if (request['kind'] !== EIP7702_UPGRADE_KIND || request['type'] !== EIP7702_TRANSACTION_TYPE) {
    throw new Error('Invalid EIP-7702 upgrade transaction type')
  }
  const data = request['data']
  if (
    request['value'] !== '0x0' ||
    typeof data !== 'string' ||
    data.length > MAX_UPGRADE_DATA_BYTES * 2 + 2 ||
    !/^0x(?:[0-9a-f]{2})*$/.test(data)
  ) {
    throw new Error('EIP-7702 upgrade transaction must carry no value and lowercase hex data')
  }

  const authority = canonicalAddress(request['authority'], 'authority')
  const from = canonicalAddress(request['from'], 'from address')
  const to = canonicalAddress(request['to'], 'to address')
  const delegate = canonicalAddress(request['delegate'], 'delegate')
  if (from !== authority || to !== authority) {
    throw new Error('EIP-7702 upgrade transaction must be self-sent by its authority')
  }

  const chainId = canonicalQuantity(request['chainId'], 'chain ID')
  const nonce = canonicalQuantity(request['nonce'], 'transaction nonce')
  const authorizationNonce = canonicalQuantity(request['authorizationNonce'], 'authorization nonce')
  const expectedFinalNonce = canonicalQuantity(request['expectedFinalNonce'], 'final nonce')
  const gasLimit = canonicalQuantity(request['gasLimit'], 'gas limit')
  const maxFeePerGas = canonicalQuantity(request['maxFeePerGas'], 'maximum fee')
  const maxPriorityFeePerGas = canonicalQuantity(request['maxPriorityFeePerGas'], 'priority fee')

  if (chainId === 0n || !isAllowedDelegate(chainId, delegate)) {
    throw new Error('EIP-7702 upgrade delegate is not allowed on this chain')
  }
  if (nonce > MAX_ACCOUNT_NONCE - 2n) throw new Error('EIP-7702 upgrade nonce is too large')
  if (authorizationNonce !== nonce + 1n || expectedFinalNonce !== nonce + 2n) {
    throw new Error('EIP-7702 upgrade nonce contract is invalid')
  }
  if (gasLimit < EIP7702_REVOKE_INTRINSIC_GAS || maxFeePerGas === 0n || maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error('EIP-7702 upgrade fee fields are invalid')
  }

  return Object.freeze({
    kind: EIP7702_UPGRADE_KIND,
    type: EIP7702_TRANSACTION_TYPE,
    authority,
    from,
    to,
    delegate,
    chainId: toRpcQuantity(chainId),
    nonce: toRpcQuantity(nonce),
    authorizationNonce: toRpcQuantity(authorizationNonce),
    expectedFinalNonce: toRpcQuantity(expectedFinalNonce),
    value: '0x0',
    data,
    gasLimit: toRpcQuantity(gasLimit),
    maxFeePerGas: toRpcQuantity(maxFeePerGas),
    maxPriorityFeePerGas: toRpcQuantity(maxPriorityFeePerGas)
  })
}

export function createEip7702UpgradeRequest(input: CreateEip7702UpgradeRequest): Eip7702UpgradeRequest {
  const authority = canonicalAddress(input.authority, 'authority')

  return parseEip7702UpgradeRequest({
    kind: EIP7702_UPGRADE_KIND,
    type: EIP7702_TRANSACTION_TYPE,
    authority,
    from: authority,
    to: authority,
    delegate: input.delegate,
    chainId: toRpcQuantity(input.chainId),
    nonce: toRpcQuantity(input.nonce),
    authorizationNonce: toRpcQuantity(input.nonce + 1n),
    expectedFinalNonce: toRpcQuantity(input.nonce + 2n),
    value: '0x0',
    data: typeof input.data === 'string' ? input.data.toLowerCase() : input.data,
    gasLimit: toRpcQuantity(input.gasLimit),
    maxFeePerGas: toRpcQuantity(input.maxFeePerGas),
    maxPriorityFeePerGas: toRpcQuantity(input.maxPriorityFeePerGas)
  })
}

// Runs inside the hot signer worker, so the parse re-checks the delegate allowlist there.
export function signEip7702UpgradeRequest(privateKey: string | Uint8Array, value: unknown): string {
  const request = parseEip7702UpgradeRequest(value)
  const signingKey = new SigningKey(privateKey)
  if (canonicalAddress(computeAddress(signingKey.publicKey), 'signer address') !== request.authority) {
    throw new Error('EIP-7702 upgrade signer does not control the authority')
  }

  const authorization = {
    address: request.delegate,
    chainId: BigInt(request.chainId),
    nonce: BigInt(request.authorizationNonce)
  }
  const transaction = Transaction.from({
    type: 4,
    chainId: BigInt(request.chainId),
    nonce: Number(BigInt(request.nonce)),
    to: request.to,
    value: 0n,
    data: request.data,
    gasLimit: BigInt(request.gasLimit),
    maxFeePerGas: BigInt(request.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(request.maxPriorityFeePerGas),
    authorizationList: [{ ...authorization, signature: signingKey.sign(hashAuthorization(authorization)) }]
  })
  transaction.signature = signingKey.sign(transaction.unsignedHash)
  const serialized = transaction.serialized

  inspectSignedEip7702UpgradeTransaction(serialized, request)
  return serialized
}

export function inspectSignedEip7702UpgradeTransaction(
  rawTransaction: unknown,
  expectedRequest: unknown
): InspectedEip7702RevokeTransaction {
  const request = parseEip7702UpgradeRequest(expectedRequest)
  if (
    typeof rawTransaction !== 'string' ||
    rawTransaction.length > request.data.length + 8194 ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(rawTransaction)
  ) {
    throw new Error('Invalid signed EIP-7702 upgrade transaction')
  }

  let transaction: Transaction
  try {
    transaction = Transaction.from(rawTransaction)
  } catch {
    throw new Error('Invalid signed EIP-7702 upgrade transaction')
  }

  if (!transaction.signature || !transaction.hash || transaction.type !== 4) {
    throw new Error('Invalid signed EIP-7702 upgrade transaction')
  }
  if (
    canonicalAddress(transaction.from, 'transaction signer') !== request.authority ||
    transaction.chainId !== BigInt(request.chainId) ||
    transaction.nonce !== Number(BigInt(request.nonce)) ||
    canonicalAddress(transaction.to, 'transaction destination') !== request.to ||
    transaction.value !== 0n ||
    transaction.data !== request.data ||
    transaction.gasLimit !== BigInt(request.gasLimit) ||
    transaction.maxFeePerGas !== BigInt(request.maxFeePerGas) ||
    transaction.maxPriorityFeePerGas !== BigInt(request.maxPriorityFeePerGas) ||
    (transaction.accessList?.length ?? 0) !== 0
  ) {
    throw new Error('Signed EIP-7702 transaction does not match the upgrade request')
  }

  const authorizations = transaction.authorizationList
  const authorization = authorizations?.length === 1 ? authorizations[0] : undefined
  if (
    !authorization ||
    canonicalAddress(authorization.address, 'delegate') !== request.delegate ||
    authorization.chainId !== BigInt(request.chainId) ||
    authorization.nonce !== BigInt(request.authorizationNonce) ||
    canonicalAddress(
      verifyAuthorization(
        { address: authorization.address, chainId: authorization.chainId, nonce: authorization.nonce },
        authorization.signature
      ),
      'authorization signer'
    ) !== request.authority
  ) {
    throw new Error('Signed EIP-7702 authorization does not match the upgrade request')
  }

  return Object.freeze({
    authority: request.authority,
    chainId: request.chainId,
    nonce: request.nonce,
    authorizationNonce: request.authorizationNonce,
    expectedFinalNonce: request.expectedFinalNonce,
    transactionHash: transaction.hash
  })
}
