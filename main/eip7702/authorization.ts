import { getAddress } from 'ethers'

import {
  inspectSignedEip7702UpgradeTransaction,
  parseEip7702UpgradeRequest,
  type Eip7702UpgradeRequest,
  type InspectedEip7702RevokeTransaction
} from '../transaction/eip7702'

export type SoftwareEip7702AuthorizationSigner = Readonly<{
  type: unknown
  status: unknown
  addresses: unknown
  signEip7702Authorization: (
    index: number,
    request: Eip7702UpgradeRequest,
    callback: (error: unknown, rawTransaction?: unknown) => void
  ) => void
}>

export type SignedEip7702Upgrade = Readonly<{
  rawTransaction: string
  evidence: InspectedEip7702RevokeTransaction
}>

// Signs an upgrade (delegation to an allowlisted contract plus a call) with a Ring or Seed signer,
// then re-inspects the returned transaction against the request.
export async function signSoftwareEip7702Authorization(
  signer: SoftwareEip7702AuthorizationSigner,
  index: number,
  request: Eip7702UpgradeRequest
): Promise<SignedEip7702Upgrade> {
  const safeRequest = parseEip7702UpgradeRequest(request)
  if (signer.type !== 'ring' && signer.type !== 'seed') {
    throw new Error('EIP-7702 upgrade requires a Ring or Seed signer')
  }
  if (typeof signer.signEip7702Authorization !== 'function') {
    throw new Error('Software signer cannot sign EIP-7702 authorizations')
  }
  if (signer.status !== 'ok') throw new Error('Software signer must be unlocked')
  const address = Array.isArray(signer.addresses) ? signer.addresses[index] : undefined
  if (!Number.isSafeInteger(index) || index < 0 || typeof address !== 'string') {
    throw new Error('Invalid software signer address index')
  }
  if (getAddress(address) !== safeRequest.authority) {
    throw new Error('Software signer does not control the EIP-7702 authority')
  }

  const rawTransaction = await new Promise<unknown>((resolve, reject) => {
    try {
      signer.signEip7702Authorization(index, safeRequest, (error, result) => {
        if (error) reject(error instanceof Error ? error : new Error(String(error)))
        else resolve(result)
      })
    } catch (error) {
      reject(error)
    }
  })
  if (typeof rawTransaction !== 'string') {
    throw new Error('Software signer returned an invalid EIP-7702 transaction')
  }

  return Object.freeze({
    rawTransaction,
    evidence: inspectSignedEip7702UpgradeTransaction(rawTransaction, safeRequest)
  })
}
