import { id, Interface, keccak256 } from 'ethers'

import { AMBIRE_KEY_PRIVILEGE, AmbireKeys } from '../../../main/eip7702/keys'

const AMBIRE = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
const AMBIRE_CODE_HASH = '0x386e55cb86f9a31fdb7926ceab54847aa4542b7a0517216144a956982a21ade3'
const FAKE_AMBIRE_CODE = '0x6000'

// The test cannot ship Ambire's runtime code, so a stand-in code maps to its verified hash.
// The allowlist, chain and indicator checks stay real.
jest.mock('../../../main/eip7702/delegates', () => {
  const actual = jest.requireActual('../../../main/eip7702/delegates')
  return {
    ...actual,
    matchesDelegateCode: (chainId: bigint, code: unknown, hash: string) =>
      actual.matchesDelegateCode(chainId, code, hash === keccak256('0x6000') ? AMBIRE_CODE_HASH : hash)
  }
})

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const KEY = '0x2222222222222222222222222222222222222222'
const OTHER = '0x3333333333333333333333333333333333333333'
const INACTIVE_KEY = '0x4444444444444444444444444444444444444444'
const ambire = new Interface([
  'function setAddrPrivilege(address addr, bytes32 priv)',
  'function executeBySender((address to, uint256 value, bytes data)[] calls)'
])
const ZERO = `0x${'00'.repeat(32)}`
const LOG_PRIVILEGE_CHANGED = id('LogPrivilegeChanged(address,bytes32)')
const privilegeLog = (key: string) => ({
  address: ACCOUNT,
  topics: [LOG_PRIVILEGE_CHANGED, `0x${key.slice(2).padStart(64, '0')}`],
  data: AMBIRE_KEY_PRIVILEGE
})
const rangeError = (): never => {
  throw new Error('Configured RPC eth_getLogs failed')
}

const setup = ({
  delegate = AMBIRE,
  delegateCode = FAKE_AMBIRE_CODE,
  confirmed = true,
  privilege = AMBIRE_KEY_PRIVILEGE,
  known = [] as string[],
  privileges = {} as Record<string, string>,
  latest = 1_000,
  getLogs = (_filter: { fromBlock: string; toBlock: string }): unknown[] => []
} = {}) => {
  const queue = jest.fn(async (_transaction: unknown) => 'handler-1')
  const remember = jest.fn()
  const confirm = jest.fn(async () => confirmed)
  const rpc = jest.fn(async (_chainId: number, method: string, params: unknown[]) => {
    if (method === 'eth_getCode') {
      return params[0] === ACCOUNT ? `0xef0100${delegate.slice(2).toLowerCase()}` : delegateCode
    }
    if (method === 'eth_call') {
      const { data } = params[0] as { data: string }
      return privileges[`0x${data.slice(-40)}`] ?? privilege
    }
    if (method === 'eth_blockNumber') return `0x${latest.toString(16)}`
    if (method === 'eth_getLogs') return getLogs(params[0] as { fromBlock: string; toBlock: string })
    throw new Error(method)
  })
  const keys = new AmbireKeys({
    rpc,
    known: () => known,
    remember,
    canReview: () => true,
    confirm,
    queue
  })
  return { keys, queue, remember, confirm, rpc }
}

// A key added to an Ambire account can move every asset, so saf0o only writes one after the
// native confirmation, only to a verified Ambire delegation, and never with a zero or marker value.
describe('Ambire account keys', () => {
  it('queues a self-call setAddrPrivilege(key, 1) only after the native confirmation', async () => {
    const { keys, queue, remember, confirm } = setup()

    await expect(keys.change(ACCOUNT, 1, KEY, true)).resolves.toEqual({
      account: ACCOUNT,
      handlerId: 'handler-1',
      type: 'transaction'
    })

    expect(confirm.mock.calls[0]?.[1]).toContain('This key gets full control of the account')
    expect(queue).toHaveBeenCalledWith({
      from: ACCOUNT,
      to: ACCOUNT,
      chainId: '0x1',
      value: '0x0',
      data: ambire.encodeFunctionData('setAddrPrivilege', [KEY, AMBIRE_KEY_PRIVILEGE])
    })
    expect(AMBIRE_KEY_PRIVILEGE).toBe(`0x${'00'.repeat(31)}01`)
    expect(remember).toHaveBeenCalledWith(ACCOUNT, 1, KEY)
  })

  it('removes a key by writing the zero privilege without a confirmation', async () => {
    const { keys, queue, confirm, remember } = setup()

    await keys.change(ACCOUNT, 1, KEY, false)

    expect(confirm).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
    expect((queue.mock.calls[0]?.[0] as { data: string }).data).toBe(
      ambire.encodeFunctionData('setAddrPrivilege', [KEY, `0x${'00'.repeat(32)}`])
    )
  })

  it.each([
    ['a declined confirmation', { confirmed: false }, KEY],
    ['a non-allowlisted delegate', { delegate: OTHER }, KEY],
    ['a delegate whose code differs', { delegateCode: '0x6001' }, KEY],
    ['the zero address as key', {}, '0x0000000000000000000000000000000000000000'],
    ['the account itself as key', {}, ACCOUNT]
  ])('queues nothing for %s', async (_label, options, key) => {
    const { keys, queue, remember } = setup(options)

    await expect(keys.change(ACCOUNT, 1, key, true)).rejects.toThrow()
    expect(queue).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
  })

  it('reads live privileges of known keys, and offers nothing off Ambire', async () => {
    await expect(setup({ known: [KEY] }).keys.list(ACCOUNT, 1)).resolves.toEqual({
      account: ACCOUNT,
      chainId: 1,
      supported: true,
      discovery: 'complete',
      keys: [{ address: KEY, privilege: AMBIRE_KEY_PRIVILEGE, external: false }]
    })
    await expect(setup({ known: [KEY], delegate: OTHER }).keys.list(ACCOUNT, 1)).resolves.toMatchObject({
      supported: false,
      keys: []
    })
  })

  // Ambire storage survives a revoke, so a key left active would regain control the next time the
  // account delegates to Ambire. Revoke waits until every known key reads zero.
  it('blocks a revoke while a known key is active, and allows it once every key reads zero', async () => {
    await expect(setup({ known: [KEY, OTHER] }).keys.assertRevocable(ACCOUNT, 1)).rejects.toThrow(
      'Clear the account keys before revoking'
    )
    await expect(
      setup({ known: [KEY], privilege: ZERO }).keys.assertRevocable(ACCOUNT, 1)
    ).resolves.toBeUndefined()
  })

  it('clears every active key in one self-call transaction', async () => {
    const { keys, queue } = setup({ known: [KEY, OTHER, INACTIVE_KEY], privileges: { [INACTIVE_KEY]: ZERO } })

    await keys.clear(ACCOUNT, 1)

    expect(queue).toHaveBeenCalledTimes(1)
    const { to, data } = queue.mock.calls[0]?.[0] as { to: string; data: string }
    expect(to).toBe(ACCOUNT)
    expect(data).toBe(
      ambire.encodeFunctionData('executeBySender', [
        [KEY, OTHER].map((key) => [ACCOUNT, 0n, ambire.encodeFunctionData('setAddrPrivilege', [key, ZERO])])
      ])
    )

    const single = setup({ known: [KEY] })
    await single.keys.clear(ACCOUNT, 1)
    expect((single.queue.mock.calls[0]?.[0] as { data: string }).data).toBe(
      ambire.encodeFunctionData('setAddrPrivilege', [KEY, ZERO])
    )
  })

  // Keys added by another wallet, or planted, never pass through saf0o's store. The account's own
  // LogPrivilegeChanged history is the only record of them, so revoke and clear must use it.
  it('blocks a revoke while a key found only in logs is active, and marks it as added outside', async () => {
    const { keys } = setup({ getLogs: () => [privilegeLog(OTHER)] })

    await expect(keys.list(ACCOUNT, 1)).resolves.toMatchObject({
      discovery: 'complete',
      keys: [{ address: OTHER, privilege: AMBIRE_KEY_PRIVILEGE, external: true }]
    })
    await expect(keys.assertRevocable(ACCOUNT, 1)).rejects.toThrow('Clear the account keys before revoking')
  })

  it('includes discovered keys in the clear transaction, and skips the account and entry point', async () => {
    const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
    const { keys, queue } = setup({
      known: [KEY],
      getLogs: () => [privilegeLog(OTHER), privilegeLog(KEY), privilegeLog(ACCOUNT), privilegeLog(entryPoint)]
    })

    await keys.clear(ACCOUNT, 1)

    expect((queue.mock.calls[0]?.[0] as { data: string }).data).toBe(
      ambire.encodeFunctionData('executeBySender', [
        [KEY, OTHER].map((key) => [ACCOUNT, 0n, ambire.encodeFunctionData('setAddrPrivilege', [key, ZERO])])
      ])
    )
  })

  // Public RPCs reject wide eth_getLogs ranges. The scan retries in chunks down to block 0, so an
  // old key is still found.
  it('falls back to a chunked scan after a range error', async () => {
    const ranges: [number, number][] = []
    const { keys } = setup({
      latest: 4_500,
      getLogs: ({ fromBlock, toBlock }) => {
        const [from, to] = [Number(fromBlock), Number(toBlock)]
        if (to - from >= 2_000) rangeError()
        ranges.push([from, to])
        return from === 0 ? [privilegeLog(OTHER)] : []
      }
    })

    await expect(keys.list(ACCOUNT, 1)).resolves.toMatchObject({
      discovery: 'complete',
      keys: [{ address: OTHER, external: true }]
    })
    expect(ranges).toEqual([
      [2_501, 4_500],
      [501, 2_500],
      [0, 500]
    ])
  })

  // An unfinished scan cannot prove the account is clean, so the revoke waits even though every
  // key saf0o knows reads zero.
  it.each([
    ['a failed chunk', { getLogs: rangeError }],
    [
      'history beyond the chunk cap',
      {
        latest: 10_000_000,
        getLogs: ({ fromBlock }: { fromBlock: string }) => (fromBlock === '0x0' ? rangeError() : [])
      }
    ]
  ])('reports incomplete discovery and blocks the revoke after %s', async (_label, options) => {
    const { keys } = setup({ known: [KEY], privilege: ZERO, ...options })

    await expect(keys.list(ACCOUNT, 1)).resolves.toMatchObject({ discovery: 'incomplete' })
    await expect(keys.assertRevocable(ACCOUNT, 1)).rejects.toThrow('full key history')
  })

  // A range-limited RPC never reaches block 0, but the recent keys it found are real and must
  // still be listed and cleared; the revoke stays refused.
  it('keeps keys found by a partial scan in the list and the clear transaction', async () => {
    const { keys, queue } = setup({
      latest: 10_000_000,
      getLogs: ({ fromBlock, toBlock }) => {
        if (fromBlock === '0x0') rangeError()
        return Number(toBlock) === 10_000_000 ? [privilegeLog(OTHER)] : []
      }
    })

    await expect(keys.list(ACCOUNT, 1)).resolves.toMatchObject({
      discovery: 'incomplete',
      keys: [{ address: OTHER, external: true }]
    })
    await expect(keys.assertRevocable(ACCOUNT, 1)).rejects.toThrow('Clear the account keys before revoking')
    await keys.clear(ACCOUNT, 1)
    expect((queue.mock.calls[0]?.[0] as { data: string }).data).toBe(
      ambire.encodeFunctionData('setAddrPrivilege', [OTHER, ZERO])
    )
  })
})
