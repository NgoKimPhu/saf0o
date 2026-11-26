import { getAddress } from 'ethers'

import type { ParsedAccountCode } from '../../resources/domain/account/code'

// Delegates saf0o may sign an EIP-7702 upgrade to. The hot signer worker loads this file,
// so keep it free of store, electron and network imports.
export const EIP7702_DELEGATES = Object.freeze([
  Object.freeze({
    name: 'Ambire',
    address: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
    codeHash: '0x386e55cb86f9a31fdb7926ceab54847aa4542b7a0517216144a956982a21ade3',
    chains: Object.freeze([1n, 10n, 56n, 100n, 8453n, 42161n])
  })
])

export function findAllowedDelegate(chainId: bigint, address: string) {
  let canonical: string
  try {
    canonical = getAddress(address)
  } catch {
    return
  }
  return EIP7702_DELEGATES.find((entry) => entry.address === canonical && entry.chains.includes(chainId))
}

export function isAllowedDelegate(chainId: bigint, address: string): boolean {
  return findAllowedDelegate(chainId, address) !== undefined
}

// accountCode is the EOA's code (the 0xef0100 indicator). delegateCodeHash must hash eth_getCode of
// the delegate address itself, so a different contract at that address fails.
export function matchesDelegateCode(
  chainId: bigint,
  accountCode: ParsedAccountCode | undefined,
  delegateCodeHash: string
): boolean {
  if (accountCode?.status !== 'delegated') return false
  return findAllowedDelegate(chainId, accountCode.delegate)?.codeHash === delegateCodeHash.toLowerCase()
}
