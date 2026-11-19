import log from 'electron-log'
import { createTx } from '@ethereumjs/tx'
import { privateToAddress } from '@ethereumjs/util'

import provider from '../../../main/provider'
import accounts from '../../../main/accounts'
import chainConfig from '../../../main/chains/config'
import { GasFeesSource } from '../../../resources/domain/transaction'

jest.mock('../../../main/store')
jest.mock('../../../main/store/persist', () => ({
  __esModule: true,
  commitMainState: jest.fn(),
  default: { pruneTransientState: jest.fn(), queue: jest.fn(), set: jest.fn() }
}))
jest.mock('../../../main/chains', () => {
  const EventEmitter = require('events')
  return Object.assign(new EventEmitter(), { send: jest.fn(), syncDataEmit: jest.fn() })
})
jest.mock('../../../main/accounts', () => ({}))
jest.mock('../../../main/reveal', () => ({ resolveEntityType: jest.fn().mockResolvedValue('external') }))
jest.mock('../../../main/contracts/erc20', () => jest.fn())
jest.mock('../../../main/provider/walletCallRuntime', () => ({ executeWalletCallRuntime: jest.fn() }))
jest.mock('../../../main/provider/walletCallEvidenceRuntime', () => ({
  __esModule: true,
  default: { wake: jest.fn() }
}))
jest.mock('../../../main/provider/walletCallStatusView', () => ({ showWalletCallStatus: jest.fn() }))

const privateKey = Buffer.from('1'.padStart(64, '0'), 'hex')
const from = `0x${Buffer.from(privateToAddress(privateKey)).toString('hex')}`
const to = '0x2222222222222222222222222222222222222222'
const attacker = '0x3333333333333333333333333333333333333333'

const reviewed = {
  from,
  to,
  chainId: '0x1',
  nonce: '0x5',
  type: '0x2',
  gasLimit: '0x5208',
  data: '0xabcdef',
  value: '0x1',
  maxFeePerGas: '0x77359400',
  maxPriorityFeePerGas: '0x3b9aca00',
  gasFeesSource: GasFeesSource.Dapp
}

const sign = (overrides = {}) => {
  const fields = { ...reviewed, ...overrides }
  const tx = createTx(
    { ...fields, gasLimit: fields.gasLimit },
    { common: chainConfig(1, 'london') }
  )
  return `0x${Buffer.from(tx.sign(privateKey).serialize()).toString('hex')}`
}

// Runs signAndSend with a signer that returns `signed`; reports whether it got past verification.
function run(signed, request = reviewed) {
  const setTxSigned = jest.fn((_id, cb) => cb(new Error('stop after verification')))
  accounts.setTxSigned = setTxSigned
  accounts.markRequestResponseSettled = jest.fn(() => true)
  accounts.signTransactionForAccount = jest.fn((_account, _tx, cb) => cb(null, signed))
  const cb = jest.fn()
  provider.signAndSend(
    { handlerId: 'h', account: from, data: request, payload: { id: 1, jsonrpc: '2.0' } },
    cb
  )
  return { cb, setTxSigned }
}

beforeAll(() => {
  log.transports.console.level = false
})

describe('signAndSend signed-bytes verification', () => {
  it('continues to broadcast when the signed bytes match the reviewed transaction', () => {
    const { setTxSigned } = run(sign())
    expect(setTxSigned).toHaveBeenCalled()
  })

  it.each([
    ['to', { to: attacker }],
    ['value', { value: '0x2' }],
    ['data', { data: '0xdeadbeef' }],
    ['nonce', { nonce: '0x6' }],
    ['fees', { maxFeePerGas: '0xffffffffff' }]
  ])('rejects signed bytes with a tampered %s before broadcast', (_name, tampered) => {
    const { cb, setTxSigned } = run(sign(tampered))
    expect(setTxSigned).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/invalid signed/i) })
    )
  })

  it('accepts the legacy form from a signer without native EIP-1559 support', () => {
    const legacy = createTx(
      { ...reviewed, type: '0x0', gasPrice: reviewed.maxFeePerGas },
      { common: chainConfig(1, 'berlin') }
    )
    const { setTxSigned } = run(`0x${Buffer.from(legacy.sign(privateKey).serialize()).toString('hex')}`)
    expect(setTxSigned).toHaveBeenCalled()
  })
})
