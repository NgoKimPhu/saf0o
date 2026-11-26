import { getAddress, id, keccak256, ZeroAddress, ZeroHash } from 'ethers'

import { parseAccountCode } from '../../resources/domain/account/code'
import { decodePrivilege, encodeExecuteBySender, encodePrivileges, encodeSetAddrPrivilege } from './ambire'
import { matchesDelegateCode } from './delegates'

// standardSigningOnlyPriv in ambire-common v2 src/interfaces/keystore.ts ("regular access" in
// src/libs/humanizer/modules/Privileges/privileges.ts). AmbireAccount.isValidSignature accepts
// unprotected signatures only for priv > 1, so 1 keeps a key shared with other accounts safer.
export const AMBIRE_KEY_PRIVILEGE = `0x${'0'.repeat(63)}1`

// AmbireAccount `event LogPrivilegeChanged(address indexed addr, bytes32 priv)`. Under EIP-7702 the
// account itself emits it, and setAddrPrivilege is the only writer of the privileges map.
const LOG_PRIVILEGE_CHANGED = id('LogPrivilegeChanged(address,bytes32)')
// AmbireAccount7702.privileges hardcodes these two, so their storage never grants anything.
const ENTRY_POINT = '0x0000000071727de22e5e9d8baf0edac6f37da032'
// Any full-range failure falls back to chunks: providers word range errors differently, so no
// message sniffing. 2,000 blocks fits common public caps; 100 chunks (~4 weeks of mainnet) bounds
// the gate's wait. Older history, or any failed chunk, reports discovery 'incomplete'.
const LOG_CHUNK = 2_000
const LOG_CHUNKS = 100

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

  // Keys from the account's own LogPrivilegeChanged history. A partial scan still returns what it found.
  private async discover(owner: string, chainId: number) {
    const { rpc } = this.dependencies
    const logs = async (from: number, to: number) => {
      const result = await rpc(chainId, 'eth_getLogs', [
        { address: owner, topics: [LOG_PRIVILEGE_CHANGED], fromBlock: hex(from), toBlock: hex(to) }
      ])
      if (!Array.isArray(result)) throw new Error('Invalid eth_getLogs result')
      return result.flatMap((log) => {
        if (log?.removed) return []
        if (String(log?.address).toLowerCase() !== owner || log.topics?.[0] !== LOG_PRIVILEGE_CHANGED) {
          throw new Error('Unexpected log')
        }
        return [getAddress(`0x${String(log.topics[1]).slice(-40)}`).toLowerCase()]
      })
    }
    let latest: number
    try {
      latest = Number(BigInt(String(await rpc(chainId, 'eth_blockNumber', []))))
    } catch {
      return { found: [], complete: false }
    }
    try {
      return { found: await logs(0, latest), complete: true }
    } catch {
      // Fall through to the chunked scan.
    }
    const found: string[] = []
    try {
      for (let chunk = 0, to = latest; chunk < LOG_CHUNKS; chunk++, to -= LOG_CHUNK) {
        const from = Math.max(0, to - LOG_CHUNK + 1)
        found.push(...(await logs(from, to)))
        if (from === 0) return { found, complete: true }
      }
    } catch {
      // A failed chunk leaves discovery incomplete.
    }
    return { found, complete: false }
  }

  // Stored keys plus keys found on chain; `external` marks keys saf0o did not add.
  async list(account: string, chainId: number) {
    const owner = account.toLowerCase()
    if (!(await this.delegatedToAmbire(owner, chainId))) {
      return { account: owner, chainId, supported: false, keys: [] }
    }
    const stored = this.dependencies.known(owner, chainId).map((address) => address.toLowerCase())
    const discovered = await this.discover(owner, chainId)
    const addresses = [...new Set([...stored, ...discovered.found])].filter(
      (address) => address !== owner && address !== ENTRY_POINT
    )
    const keys = await Promise.all(
      addresses.map(async (address) => {
        const result = await this.dependencies.rpc(chainId, 'eth_call', [
          { to: owner, data: encodePrivileges(address) },
          'latest'
        ])
        return { address, privilege: decodePrivilege(String(result)), external: !stored.includes(address) }
      })
    )
    const discovery = discovered.complete ? ('complete' as const) : ('incomplete' as const)
    return { account: owner, chainId, supported: true, discovery, keys }
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

  // Revoking leaves Ambire storage in place, so every key must read zero before a revoke, and an
  // unfinished scan cannot prove that.
  // Revoking is itself protective, so an incomplete key history asks the user ('confirm') instead of blocking.
  // Approval passes 'allow': the user already confirmed when the revoke was queued.
  async assertRevocable(
    account: string,
    chainId: number,
    incomplete: 'refuse' | 'confirm' | 'allow' = 'refuse'
  ) {
    const list = await this.list(account, chainId)
    if (list.keys.some(({ privilege }) => privilege !== ZeroHash)) {
      throw new Error('Clear the account keys before revoking')
    }
    if ('discovery' in list && list.discovery === 'incomplete' && incomplete !== 'allow') {
      if (
        incomplete === 'confirm' &&
        (await this.dependencies.confirm(
          'Revoke without a full key history?',
          'The configured RPC could not return this account’s full Ambire key history. Keys Saf0o could not find stay in the account’s storage and regain full control if this account delegates to Ambire again.',
          'Revoke Anyway'
        ))
      ) {
        return
      }
      throw new Error(
        'The configured RPC could not return this account’s full key history, so Saf0o cannot confirm every Ambire key is cleared. Use an RPC that serves eth_getLogs over the full chain history, then try again.'
      )
    }
  }

  // One transaction zeroes every active key, stored or discovered: executeBySender of self-calls for several.
  async clear(account: string, chainId: number) {
    const owner = account.toLowerCase()
    if (!this.dependencies.canReview(owner)) throw new Error('Select an available signing account')
    const { keys } = await this.list(owner, chainId)
    const calls = keys
      .filter(({ privilege }) => privilege !== ZeroHash)
      .map(({ address }) => ({ to: owner, value: 0n, data: encodeSetAddrPrivilege(address, ZeroHash) }))
    if (calls.length === 0) throw new Error('No active keys to clear')
    const data = calls.length === 1 ? calls[0]!.data : encodeExecuteBySender(calls)
    const handlerId = await this.queue(owner, chainId, data)
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

const hex = (block: number) => `0x${block.toString(16)}`
