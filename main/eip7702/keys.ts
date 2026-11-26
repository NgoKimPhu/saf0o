import { getAddress, keccak256, ZeroAddress, ZeroHash } from 'ethers'

import { parseAccountCode } from '../../resources/domain/account/code'
import { decodePrivilege, encodePrivileges, encodeSetAddrPrivilege } from './ambire'
import { matchesDelegateCode } from './delegates'

// standardSigningOnlyPriv in ambire-common v2 src/interfaces/keystore.ts ("regular access" in
// src/libs/humanizer/modules/Privileges/privileges.ts). AmbireAccount.isValidSignature accepts
// unprotected signatures only for priv > 1, so 1 keeps a key shared with other accounts safer.
export const AMBIRE_KEY_PRIVILEGE = `0x${'0'.repeat(63)}1`

export type AmbireKeyTransaction = Readonly<{
  from: string
  to: string
  chainId: string
  value: '0x0'
  data: string
}>

type Dependencies = {
  rpc(chainId: number, method: string, params: unknown[]): Promise<unknown>
  known(account: string, chainId: number): string[]
  remember(account: string, chainId: number, key: string): void
  canReview(account: string): boolean
  confirm(message: string, detail: string, confirmLabel: string): Promise<boolean>
  queue(transaction: AmbireKeyTransaction): Promise<string>
}

export class AmbireKeys {
  constructor(private dependencies: Dependencies) {}

  // True only for a delegation to an allowlisted Ambire delegate whose own code hash matches.
  private async delegatedToAmbire(account: string, chainId: number) {
    const code = parseAccountCode(await this.dependencies.rpc(chainId, 'eth_getCode', [account, 'latest']))
    if (code?.status !== 'delegated') return false
    const delegateCode = await this.dependencies.rpc(chainId, 'eth_getCode', [code.delegate, 'latest'])
    if (typeof delegateCode !== 'string') return false
    return matchesDelegateCode(BigInt(chainId), code, keccak256(delegateCode))
  }

  // ponytail: lists only keys added in saf0o; keys added by other wallets are not discovered.
  // Scan LogPrivilegeChanged if that matters.
  async list(account: string, chainId: number) {
    const owner = account.toLowerCase()
    if (!(await this.delegatedToAmbire(owner, chainId))) {
      return { account: owner, chainId, supported: false, keys: [] }
    }
    const keys = await Promise.all(
      this.dependencies.known(owner, chainId).map(async (address) => {
        const result = await this.dependencies.rpc(chainId, 'eth_call', [
          { to: owner, data: encodePrivileges(address) },
          'latest'
        ])
        return { address, privilege: decodePrivilege(String(result)) }
      })
    )
    return { account: owner, chainId, supported: true, keys }
  }

  async change(account: string, chainId: number, key: string, add: boolean) {
    const owner = account.toLowerCase()
    const address = getAddress(key)
    if (address === ZeroAddress || address.toLowerCase() === owner) throw new Error('Invalid key address')
    if (!this.dependencies.canReview(owner)) throw new Error('Select an available signing account')
    if (!(await this.delegatedToAmbire(owner, chainId))) throw new Error('Account is not delegated to Ambire')
    if (
      add &&
      !(await this.dependencies.confirm(
        'Add a key to this account?',
        `This key gets full control of the account on chain ${chainId}: ${address}. It can move every asset and add or remove keys.`,
        'Add key'
      ))
    ) {
      throw new Error('Key change cancelled')
    }
    const data = encodeSetAddrPrivilege(address, add ? AMBIRE_KEY_PRIVILEGE : ZeroHash)
    const handlerId = await this.queue(owner, chainId, data)
    if (add) this.dependencies.remember(owner, chainId, address.toLowerCase())
    return { account: owner, handlerId, type: 'transaction' as const }
  }

  // A self-call: the EOA is msg.sender == address(this), which setAddrPrivilege requires.
  private queue(owner: string, chainId: number, data: string) {
    return this.dependencies.queue({
      from: owner,
      to: owner,
      chainId: `0x${chainId.toString(16)}`,
      value: '0x0',
      data
    })
  }
}
