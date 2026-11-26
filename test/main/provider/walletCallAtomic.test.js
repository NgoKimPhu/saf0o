import { Interface, Wallet } from 'ethers'

import {
  chooseWalletCallsAtomicMode,
  isAllowedBatchSender,
  submittedApprovalTransactions,
  walletCallsAtomicStatus,
  walletCallsExecutionCalls,
  walletCallsSimulationOverrides,
  walletCallsUpgradeRequest
} from '../../../main/provider/walletCallAtomic'
import { verifySignedTransaction } from '../../../main/provider/walletCallPreparedExecution'
import { WalletCallBatchLedger } from '../../../main/provider/walletCallBatches'
import { EIP7702_DELEGATES } from '../../../main/eip7702'
import { signEip7702UpgradeRequest } from '../../../main/transaction/eip7702'

// eth_getCode of the real delegate is large; this stand-in hashes to the allowlisted code hash.
const AMBIRE_RUNTIME = '0x6001600155'
jest.mock('../../../resources/domain/account/code', () => {
  const actual = jest.requireActual('../../../resources/domain/account/code')
  return {
    ...actual,
    parseAccountCode: (value) =>
      value === '0x6001600155'
        ? {
            status: 'contract',
            codeHash: '0x386e55cb86f9a31fdb7926ceab54847aa4542b7a0517216144a956982a21ade3'
          }
        : actual.parseAccountCode(value)
  }
})

const ambire = EIP7702_DELEGATES[0]
const wallet = new Wallet(`0x${'11'.repeat(32)}`)
const account = wallet.address.toLowerCase()
const target = '0x3333333333333333333333333333333333333333'
const indicator = `0xef0100${ambire.address.slice(2).toLowerCase()}`
const executeBySender = new Interface([
  'function executeBySender((address to, uint256 value, bytes data)[] calls)'
])

const codeReader = (codes) => jest.fn(async (address) => codes[address.toLowerCase()] ?? '0x')

describe('walletCallsAtomicStatus', () => {
  it('is supported only when the account delegates to Ambire and the delegate code hash matches', async () => {
    const getCode = codeReader({ [account]: indicator, [ambire.address.toLowerCase()]: AMBIRE_RUNTIME })
    await expect(walletCallsAtomicStatus(1n, account, false, getCode)).resolves.toBe('supported')
  })

  it('is unsupported when the delegate address holds other code', async () => {
    const getCode = codeReader({ [account]: indicator, [ambire.address.toLowerCase()]: '0x6000' })
    await expect(walletCallsAtomicStatus(1n, account, true, getCode)).resolves.toBe('unsupported')
  })

  it('is ready only for a codeless account with a software signer', async () => {
    await expect(walletCallsAtomicStatus(1n, account, true, codeReader({}))).resolves.toBe('ready')
    await expect(walletCallsAtomicStatus(1n, account, false, codeReader({}))).resolves.toBe('unsupported')
  })

  it('reads no code on a chain outside the allowlist', async () => {
    const getCode = codeReader({})
    await expect(walletCallsAtomicStatus(137n, account, true, getCode)).resolves.toBe('unsupported')
    expect(getCode).not.toHaveBeenCalled()
  })

  it('treats an RPC failure as unsupported, never as ready', async () => {
    const getCode = jest.fn().mockRejectedValue(new Error('down'))
    await expect(walletCallsAtomicStatus(1n, account, true, getCode)).resolves.toBe('unsupported')
  })
})

describe('chooseWalletCallsAtomicMode', () => {
  const calls = [
    { to: target, data: '0x', value: '0x1' },
    { to: target, data: '0xabcd', value: '0x0' }
  ]
  const request = (overrides = {}) => ({ atomicRequired: false, calls, ...overrides })

  it('answers 5760 for required atomicity on an unsupported account, else runs sequentially', async () => {
    const confirm = jest.fn()
    await expect(
      chooseWalletCallsAtomicMode(request({ atomicRequired: true }), 'unsupported', confirm)
    ).rejects.toEqual({ code: 5760, message: 'Atomicity not supported' })
    await expect(chooseWalletCallsAtomicMode(request(), 'unsupported', confirm)).resolves.toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('runs a batch with a contract creation sequentially, because executeBySender cannot create', async () => {
    const creation = [...calls, { data: '0x6000', value: '0x0' }]
    await expect(
      chooseWalletCallsAtomicMode(request({ calls: creation, atomicRequired: true }), 'supported', jest.fn())
    ).rejects.toMatchObject({ code: 5760 })
    await expect(
      chooseWalletCallsAtomicMode(request({ calls: creation }), 'supported', jest.fn())
    ).resolves.toBe(false)
  })

  it('uses an existing Ambire delegation without asking', async () => {
    const confirm = jest.fn()
    await expect(chooseWalletCallsAtomicMode(request(), 'supported', confirm)).resolves.toBe('delegated')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('answers 5750 when the user declines a required upgrade, else falls back to sequential', async () => {
    const decline = jest.fn().mockResolvedValue(false)
    await expect(
      chooseWalletCallsAtomicMode(request({ atomicRequired: true }), 'ready', decline)
    ).rejects.toEqual({
      code: 5750,
      message: 'Atomic-ready wallet rejected upgrade'
    })
    await expect(chooseWalletCallsAtomicMode(request(), 'ready', decline)).resolves.toBe(false)
    await expect(
      chooseWalletCallsAtomicMode(request(), 'ready', jest.fn().mockResolvedValue(true))
    ).resolves.toBe('upgrade')
  })

  it('does not offer an upgrade for a single optional call', async () => {
    const confirm = jest.fn()
    await expect(chooseWalletCallsAtomicMode(request({ calls: [calls[0]] }), 'ready', confirm)).resolves.toBe(
      false
    )
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('atomic execution shape', () => {
  const calls = [
    { to: target, data: '0x', value: '0x5' },
    { to: target, data: '0xabcd', value: '0x7' }
  ]

  it('signs one zero-value self-call that carries every reviewed call', () => {
    const [wrapper, ...rest] = walletCallsExecutionCalls({ atomic: 'delegated', account, calls })
    expect(rest).toEqual([])
    expect(wrapper).toMatchObject({ to: account, value: '0x0' })
    const [decoded] = executeBySender.decodeFunctionData('executeBySender', wrapper.data)
    expect(decoded.map(([to, value, data]) => ({ to: to.toLowerCase(), value, data }))).toEqual([
      { to: target, value: 5n, data: '0x' },
      { to: target, value: 7n, data: '0xabcd' }
    ])
    expect(walletCallsExecutionCalls({ atomic: false, account, calls })).toEqual(calls)
  })

  it('simulates an upgrade with the delegation indicator as the account code', () => {
    expect(walletCallsSimulationOverrides({ atomic: 'upgrade', account, chainId: '0x1' })).toEqual({
      [account]: { code: indicator }
    })
    expect(walletCallsSimulationOverrides({ atomic: 'delegated', account, chainId: '0x1' })).toBeUndefined()
  })

  it('knows an Ambire-delegated sender only with the matching delegate code hash', () => {
    const sender = {
      status: 'delegated',
      delegate: ambire.address.toLowerCase(),
      delegateCodeHash: ambire.codeHash
    }
    expect(isAllowedBatchSender(1n, sender)).toBe(true)
    expect(isAllowedBatchSender(1n, { ...sender, delegateCodeHash: `0x${'00'.repeat(32)}` })).toBe(false)
    expect(isAllowedBatchSender(137n, sender)).toBe(false)
  })
})

describe('upgrade signing', () => {
  const [wrapper] = walletCallsExecutionCalls({
    atomic: 'upgrade',
    account,
    calls: [{ to: target, data: '0x', value: '0x1' }]
  })
  const prepared = {
    from: account,
    to: account,
    chainId: '0x1',
    nonce: '0x5',
    type: '0x2',
    gasLimit: '0x2ab98',
    maxFeePerGas: '0x2',
    maxPriorityFeePerGas: '0x1',
    data: wrapper.data,
    value: '0x0',
    gasFeesSource: 'Frame'
  }

  it('turns the prepared self-call into a type-4 delegation to Ambire with the same fields', () => {
    expect(walletCallsUpgradeRequest(prepared)).toMatchObject({
      authority: wallet.address,
      to: wallet.address,
      delegate: ambire.address,
      nonce: '0x5',
      authorizationNonce: '0x6',
      gasLimit: '0x2ab98',
      data: wrapper.data
    })
    expect(() => walletCallsUpgradeRequest({ ...prepared, to: target })).toThrow(/self-call/)
  })

  it('accepts the signed upgrade only when it matches the prepared transaction', () => {
    const raw = signEip7702UpgradeRequest(wallet.privateKey, walletCallsUpgradeRequest(prepared))
    expect(verifySignedTransaction(raw, prepared)).toEqual({ rawTransaction: raw })
    expect(() => verifySignedTransaction(raw, { ...prepared, gasLimit: '0x2ab99' })).toThrow(
      /does not match prepared transaction/
    )
  })
})

describe('atomic ledger', () => {
  const hash = `0x${'4'.repeat(64)}`
  const storage = () => {
    let batches = {}
    return { load: () => batches, save: (value) => (batches = JSON.parse(JSON.stringify(value))) }
  }

  it('completes an atomic batch with one type-4 receipt and reports atomic: true', () => {
    const ledger = new WalletCallBatchLedger(storage())
    ledger
      .create({ id: 'atomic', origin: 'o', account, chainId: '0x1', callCount: 1, atomic: true }, 1000)
      .commit()
    ledger.reserveTransaction('o', account, 'atomic', hash, 1001)
    ledger.markTransactionSubmitted('o', account, 'atomic', hash, 1002)
    ledger.complete('o', account, 'atomic', 1003)
    ledger.recordReceipt(
      'o',
      account,
      'atomic',
      {
        logs: [],
        status: '0x1',
        type: '0x4',
        blockHash: `0x${'b'.repeat(64)}`,
        blockNumber: '0x1',
        gasUsed: '0x5208',
        transactionHash: hash
      },
      1004
    )

    expect(ledger.getStatus('o', account, 'atomic', 1005)).toMatchObject({
      status: 200,
      atomic: true,
      receipts: [{ type: '0x4', transactionHash: hash }]
    })
  })
})

describe('approval observation in atomic batches', () => {
  const account = '0x00000000000000000000000000000000000a11ce'
  const token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
  const spender = '0x000000000000000000000000000000000000beef'
  const approve = new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [
    spender,
    1
  ])
  const wrapper = { from: account, to: account, chainId: '0x1', data: '0xabc5345e', value: '0x0' }
  const calls = [
    { to: token, data: approve, value: '0x0' },
    { to: spender, data: '0x', value: '0x1' }
  ]

  it('observes each inner call so an approve inside the batch reaches the approvals list', () => {
    // The wrapper's to/data is a self-call; observing only it would never decode the approve.
    const observed = submittedApprovalTransactions(wrapper, 'delegated', calls)
    expect(observed.map(({ from, to, data, chainId }) => ({ from, to, data, chainId }))).toEqual([
      { from: account, to: token, data: approve, chainId: '0x1' },
      { from: account, to: spender, data: '0x', chainId: '0x1' }
    ])
  })

  it('observes a sequential call as signed', () => {
    expect(submittedApprovalTransactions(wrapper, false, calls)).toEqual([wrapper])
  })
})
