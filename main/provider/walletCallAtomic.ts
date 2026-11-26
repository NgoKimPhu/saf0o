import { parseAccountCode } from '../../resources/domain/account/code'
import type { TransactionData } from '../../resources/domain/transaction'
import type { AccountCodeEvidence } from '../transaction/simulation'
import {
  createEip7702UpgradeRequest,
  EIP7702_DELEGATES,
  encodeExecuteBySender,
  matchesDelegateCode
} from '../eip7702'
import { MAX_WALLET_CALL_DATA_BYTES, type SendCallsRequest, type WalletCall } from './walletCalls'

// EIP-5792 atomic status. supported: already delegated to an allowlisted batch delegate.
// ready: no code and a software signer, so saf0o can upgrade it after user consent.
export type WalletCallsAtomicStatus = 'supported' | 'ready' | 'unsupported'
export type WalletCallsAtomicMode = false | 'delegated' | 'upgrade'

// EIP-7702 PER_EMPTY_ACCOUNT_COST. eth_estimateGas without an authorization list omits it.
export const EIP7702_AUTHORIZATION_GAS = 25_000n

export function batchDelegate(chainId: bigint) {
  return EIP7702_DELEGATES.find((delegate) => delegate.chains.includes(chainId))
}

export function delegationCode(chainId: bigint) {
  const delegate = batchDelegate(chainId)
  if (!delegate) throw new Error('No batch delegate on this chain')
  return `0xef0100${delegate.address.slice(2).toLowerCase()}`
}

export async function walletCallsAtomicStatus(
  chainId: bigint,
  account: string,
  softwareSigner: boolean,
  getCode: (address: string) => Promise<unknown>
): Promise<WalletCallsAtomicStatus> {
  if (!batchDelegate(chainId)) return 'unsupported'
  try {
    const code = parseAccountCode(await getCode(account))
    if (code?.status === 'no-code') return softwareSigner ? 'ready' : 'unsupported'
    if (code?.status !== 'delegated') return 'unsupported'
    const delegateCode = parseAccountCode(await getCode(code.delegate))
    return delegateCode && matchesDelegateCode(chainId, code, delegateCode.codeHash)
      ? 'supported'
      : 'unsupported'
  } catch {
    return 'unsupported'
  }
}

// A sender delegated to an allowlisted batch delegate whose code hash matches is known, not a risk.
export function isAllowedBatchSender(chainId: bigint, sender: AccountCodeEvidence | undefined) {
  return sender?.status === 'delegated' && matchesDelegateCode(chainId, sender, sender.delegateCodeHash ?? '')
}

// Simulates an upgrade batch as if the account already had the delegate's code.
export function walletCallsSimulationOverrides(
  request: Readonly<{ atomic?: WalletCallsAtomicMode; account: string; chainId: string }>
) {
  if (request.atomic !== 'upgrade') return undefined
  return { [request.account.toLowerCase()]: { code: delegationCode(BigInt(request.chainId)) } }
}

function executeBySenderData(calls: readonly WalletCall[]) {
  return encodeExecuteBySender(
    calls.map((call) => ({ to: call.to as string, value: BigInt(call.value), data: call.data }))
  )
}

// Chooses how wallet_sendCalls runs. Throws the EIP-5792 error when atomicity is required but unavailable.
export async function chooseWalletCallsAtomicMode(
  request: Pick<SendCallsRequest, 'atomicRequired' | 'calls'>,
  status: WalletCallsAtomicStatus,
  confirmUpgrade: () => Promise<boolean>
): Promise<WalletCallsAtomicMode> {
  const wrappable =
    request.calls.every((call) => typeof call.to === 'string') &&
    (executeBySenderData(request.calls).length - 2) / 2 <= MAX_WALLET_CALL_DATA_BYTES
  if (status === 'unsupported' || !wrappable) {
    if (request.atomicRequired) throw { code: 5760, message: 'Atomicity not supported' }
    return false
  }
  if (status === 'supported') return 'delegated'
  if (!request.atomicRequired && request.calls.length < 2) return false
  if (await confirmUpgrade()) return 'upgrade'
  if (request.atomicRequired) throw { code: 5750, message: 'Atomic-ready wallet rejected upgrade' }
  return false
}

// The calls saf0o signs: the reviewed calls, or one self-call that runs them through executeBySender.
export function walletCallsExecutionCalls(
  request: Readonly<{ atomic?: WalletCallsAtomicMode; account: string; calls: readonly WalletCall[] }>
): WalletCall[] {
  if (!request.atomic) return request.calls.map((call) => ({ ...call }))
  return [{ to: request.account.toLowerCase(), data: executeBySenderData(request.calls), value: '0x0' }]
}

// Builds the type-4 upgrade request for a prepared type-2 self-call wrapper.
export function walletCallsUpgradeRequest(transaction: Readonly<TransactionData>) {
  const chainId = BigInt(transaction.chainId)
  const delegate = batchDelegate(chainId)
  if (
    !delegate ||
    transaction.type !== '0x2' ||
    !transaction.maxFeePerGas ||
    !transaction.maxPriorityFeePerGas ||
    !transaction.from ||
    !transaction.data ||
    transaction.to?.toLowerCase() !== transaction.from.toLowerCase()
  ) {
    throw new Error('Account upgrade needs an EIP-1559 self-call on an allowlisted chain')
  }
  return createEip7702UpgradeRequest({
    authority: transaction.from,
    chainId,
    nonce: BigInt(transaction.nonce as string),
    gasLimit: BigInt(transaction.gasLimit as string),
    maxFeePerGas: BigInt(transaction.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
    delegate: delegate.address,
    data: transaction.data
  })
}

// Approval observation decodes one transaction's to/data. An atomic batch signs a single self-call,
// so each inner call is observed under the wrapper's hash instead.
export function submittedApprovalTransactions(
  transaction: Readonly<TransactionData>,
  atomic: WalletCallsAtomicMode,
  calls: readonly WalletCall[]
): Readonly<TransactionData>[] {
  if (!atomic) return [transaction]
  return calls.flatMap((call) =>
    call.to ? [{ ...transaction, to: call.to, data: call.data, value: call.value }] : []
  )
}
