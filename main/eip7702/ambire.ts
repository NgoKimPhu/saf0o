import { Interface } from 'ethers'

// AmbireAccount (ambire-common v2, contracts/AmbireAccount.sol): the calls saf0o makes on an account
// delegated to AmbireAccount7702.
const ambire = new Interface([
  'function executeBySender((address to, uint256 value, bytes data)[] calls) payable',
  'function setAddrPrivilege(address addr, bytes32 priv) payable',
  'function privileges(address addr) view returns (bytes32)'
])

export type AmbireCall = Readonly<{ to: string; value: bigint; data: string }>

// executeBySender has no contract creation, so every call needs a `to`.
export function encodeExecuteBySender(calls: readonly AmbireCall[]): string {
  if (calls.length === 0) throw new Error('Ambire batch needs at least one call')
  if (calls.some((call) => typeof call?.to !== 'string')) {
    throw new Error('Ambire batch call needs a destination')
  }
  return ambire.encodeFunctionData('executeBySender', [calls.map(({ to, value, data }) => [to, value, data])])
}

export function encodeSetAddrPrivilege(addr: string, priv: string): string {
  return ambire.encodeFunctionData('setAddrPrivilege', [addr, priv])
}

export function encodePrivileges(addr: string): string {
  return ambire.encodeFunctionData('privileges', [addr])
}

// Decodes the eth_call result of privileges(addr) to a lowercase bytes32 hex string.
export function decodePrivilege(result: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error('Invalid Ambire privilege result')
  return result.toLowerCase()
}
