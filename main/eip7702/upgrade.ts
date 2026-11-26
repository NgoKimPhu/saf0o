import { getAddress, keccak256 } from 'ethers'

import { parseAccountCode, type ParsedAccountCode } from '../../resources/domain/account/code'
import { parseRpcQuantity, toRpcQuantity } from '../../resources/domain/transaction/quantity'
import { EIP7702_DELEGATES, isTrezorDelegate } from './delegates'
import {
  EIP7702_REVOKE_DELEGATE,
  inspectSignedEip7702UpgradeTransaction,
  parseEip7702UpgradeRequest,
  type Eip7702UpgradeRequest
} from '../transaction/eip7702'
import type { Eip7702RevokeEvidence, Eip7702RevokePreflight, SignedEip7702Revoke } from './revoke'

// Dash upgrade: a Trezor signs a type-4 self-call with empty data that delegates to Ambire.
// 21000 + 25000 per authorization + 2600 cold delegate load + Ambire receive(), with margin.
export const EIP7702_UPGRADE_GAS_LIMIT = 60_000n

export type TrezorEip7702UpgradeSigner = Readonly<{
  type: unknown
  status: unknown
  addresses: unknown
  signEip7702Authorization: (
    index: number,
    request: Eip7702UpgradeRequest,
    callback: (error: unknown, rawTransaction?: unknown) => void
  ) => void
}>

// The delegate a Trezor account upgrades to on this chain: allowlisted and whitelisted by the firmware.
export const trezorUpgradeDelegate = (chainId: bigint) =>
  EIP7702_DELEGATES.find(
    (delegate) => delegate.chains.includes(chainId) && isTrezorDelegate(chainId, delegate.address)
  )

// Evidence that the account has no code yet. Same shape as the revoke evidence, so the
// stability check before signing is shared; delegate and codeHash describe the empty account.
export function inspectEip7702UpgradePreflight(
  authority: string,
  preflight: Eip7702RevokePreflight
): Eip7702RevokeEvidence {
  const accountCode = parseAccountCode(preflight.authorityCode)
  if (accountCode?.status !== 'no-code') throw new Error('EIP-7702 upgrade requires an account without code')
  const latestNonce = parseRpcQuantity(preflight.latestNonce)
  const pendingNonce = parseRpcQuantity(preflight.pendingNonce)
  if (
    latestNonce === undefined ||
    pendingNonce === undefined ||
    toRpcQuantity(latestNonce) !== preflight.latestNonce ||
    toRpcQuantity(pendingNonce) !== preflight.pendingNonce ||
    latestNonce !== pendingNonce
  ) {
    throw new Error('EIP-7702 upgrade requires a stable account nonce')
  }
  return Object.freeze({
    source: 'eth_getCode',
    authority: getAddress(authority).toLowerCase(),
    delegate: EIP7702_REVOKE_DELEGATE,
    codeHash: keccak256('0x'),
    latestNonce: toRpcQuantity(latestNonce),
    pendingNonce: toRpcQuantity(pendingNonce)
  })
}

export function assertTrezorEip7702UpgradeSigner(
  signer: TrezorEip7702UpgradeSigner,
  index: number,
  authority: string
) {
  if (signer.type !== 'trezor' || typeof signer.signEip7702Authorization !== 'function') {
    throw new Error('EIP-7702 upgrade from the dash requires a Trezor signer')
  }
  if (signer.status !== 'ready') throw new Error('Trezor must be ready')
  const address = Array.isArray(signer.addresses) ? signer.addresses[index] : undefined
  if (typeof address !== 'string' || address.toLowerCase() !== authority.toLowerCase()) {
    throw new Error('Trezor does not control the EIP-7702 authority')
  }
}

export async function signTrezorEip7702Upgrade(
  signer: TrezorEip7702UpgradeSigner,
  index: number,
  request: Eip7702UpgradeRequest
): Promise<SignedEip7702Revoke> {
  const safeRequest = parseEip7702UpgradeRequest(request)
  assertTrezorEip7702UpgradeSigner(signer, index, safeRequest.authority)
  const rawTransaction = await new Promise<unknown>((resolve, reject) => {
    signer.signEip7702Authorization(index, safeRequest, (error, result) => {
      if (error) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve(result)
    })
  })
  if (typeof rawTransaction !== 'string') throw new Error('Trezor returned an invalid EIP-7702 transaction')
  return Object.freeze({
    rawTransaction,
    evidence: inspectSignedEip7702UpgradeTransaction(rawTransaction, safeRequest)
  })
}

// Shared by the live monitor and the restart reconciler. No delegate: revoke, success is no code.
// With a delegate: success is a delegation to exactly that address.
export function eip7702TargetReached(code: ParsedAccountCode | undefined, delegate?: string) {
  if (!delegate) return code?.status === 'no-code'
  return code?.status === 'delegated' && code.delegate === delegate.toLowerCase()
}

// Native consent before the dash request exists. Names the delegate and says the delegation persists.
export async function confirmEip7702Upgrade(
  chainId: number,
  confirm: (message: string, detail: string, confirmLabel: string) => Promise<boolean>
) {
  const delegate =
    Number.isSafeInteger(chainId) && chainId > 0 ? trezorUpgradeDelegate(BigInt(chainId)) : undefined
  if (!delegate) throw new Error('No EIP-7702 delegate a Trezor can sign on this chain')
  const confirmed = await confirm(
    `Upgrade this account to an ${delegate.name} smart account?`,
    `The account delegates its execution to the ${delegate.name} contract ${delegate.address} on chain ${chainId}. ` +
      'The delegation stays until you revoke it. While it is set, that contract’s code runs for this account. ' +
      'Your Trezor shows the delegate for a final check.',
    'Upgrade account'
  )
  if (!confirmed) throw new Error('Account upgrade cancelled')
}
