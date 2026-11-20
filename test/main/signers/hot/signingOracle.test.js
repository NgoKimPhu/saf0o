import { Transaction, SigningKey, hashMessage, TypedDataEncoder, HDNodeWallet, Mnemonic } from 'ethers'
import HotSignerWorker from '../../../../main/signers/hot/HotSigner/worker'
import { sign as signWithDevice } from '../../../../main/transaction'
import { encode } from 'rlp'
import { createHash } from 'crypto'
import { v5 as uuidv5 } from 'uuid'
import { deriveHDAccounts } from '../../../../main/signers/Signer/derive'

// The dependency bump moved @ethereumjs/{tx,common,util} and @metamask/eth-sig-util across majors
// without a byte-level check. ethers is independent of both, so it is the oracle: a changed
// signature byte or serialization in the bumped packages fails here.
const PHRASE = 'test test test test test test test test test test test junk'
const keyHex = '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
const key = Buffer.from(keyHex, 'hex')
const signing = new SigningKey(`0x${keyHex}`)
const to = '0xbe188d6641e8b680743a4815dfa0f6208038960f'
const accessList = [{ address: to, storageKeys: [`0x${'0'.repeat(63)}1`] }]

let worker
beforeEach(() => {
  worker = new HotSignerWorker()
})

const call = (method, ...args) =>
  new Promise((resolve, reject) => worker[method](...args, (err, res) => (err ? reject(err) : resolve(res))))

const oracleTx = (fields) => {
  const tx = Transaction.from(fields)
  tx.signature = signing.sign(tx.unsignedHash)
  return tx.serialized
}

describe('transaction signing matches an independent implementation', () => {
  const base = { nonce: '0x6', gasLimit: '0x5208', to, value: '0xb5e620f48000', data: '0x1234' }
  const cases = [
    ['legacy EIP-155', { type: '0x0', gasPrice: '0xb2d05e00' }, { type: 0, gasPrice: 0xb2d05e00 }],
    [
      'EIP-2930',
      { type: '0x1', gasPrice: '0xb2d05e00', accessList },
      { type: 1, gasPrice: 0xb2d05e00, accessList }
    ],
    [
      'EIP-1559',
      { type: '0x2', maxFeePerGas: '0xb2d05e00', maxPriorityFeePerGas: '0x3b9aca00', accessList },
      { type: 2, maxFeePerGas: 0xb2d05e00, maxPriorityFeePerGas: 0x3b9aca00, accessList }
    ]
  ]

  // 137 and 8453 are preset chains, 31337 and 4294967297 exercise the custom-chain path.
  const chainIds = [1, 137, 8453, 31337, 4294967297]
  cases.forEach(([name, raw, oracle]) =>
    chainIds.forEach((chainId) =>
      it(`${name} on chain ${chainId}`, async () => {
        const rawTx = { ...base, ...raw, chainId: `0x${chainId.toString(16)}` }
        const expected = oracleTx({ ...base, ...oracle, chainId, value: BigInt(base.value) })
        expect(await call('signTransaction', key, rawTx)).toBe(expected)
      })
    )
  )
})

describe('hardware-wallet signing payload matches an independent implementation', () => {
  // Ledger sends tx.getMessageToSign() (RLP-encoded when it returns a list) to the device.
  const base = { nonce: '0x6', gasLimit: '0x5208', to, value: '0xb5e620f48000', data: '0x1234' }
  const cases = [
    ['legacy', { type: '0x0', gasPrice: '0xb2d05e00' }, { type: 0, gasPrice: 0xb2d05e00 }],
    [
      'EIP-2930',
      { type: '0x1', gasPrice: '0xb2d05e00', accessList },
      { type: 1, gasPrice: 0xb2d05e00, accessList }
    ],
    [
      'EIP-1559',
      { type: '0x2', maxFeePerGas: '0xb2d05e00', maxPriorityFeePerGas: '0x3b9aca00', accessList },
      { type: 2, maxFeePerGas: 0xb2d05e00, maxPriorityFeePerGas: 0x3b9aca00, accessList }
    ]
  ]
  cases.forEach(([name, raw, oracle]) =>
    it(`${name} message to sign`, async () => {
      let sent
      await signWithDevice({ ...base, ...raw, chainId: '0x89' }, async (tx) => {
        const message = tx.getMessageToSign()
        sent = Buffer.from(Array.isArray(message) ? encode(message) : message).toString('hex')
        return { v: oracle.type === 0 ? '0x136' : '0x1', r: '0x01', s: '0x01' }
      })
      const expected = Transaction.from({ ...base, ...oracle, chainId: 137, value: BigInt(base.value) })
      expect(`0x${sent}`).toBe(expected.unsignedSerialized)
    })
  )
})

describe('message signing matches an independent implementation', () => {
  it('personal_sign of text and of hex bytes', async () => {
    for (const message of ['0x68656c6c6f', '0x', `0x${'ab'.repeat(300)}`]) {
      const bytes = Buffer.from(message.slice(2), 'hex')
      expect(await call('signMessage', key, message)).toBe(signing.sign(hashMessage(bytes)).serialized)
    }
  })

  it('EIP-712 V4 typed data', async () => {
    const domain = { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: to }
    const types = {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallets', type: 'address[]' }
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person[]' },
        { name: 'contents', type: 'string' }
      ]
    }
    const message = {
      from: { name: 'Cow', wallets: [to] },
      to: [{ name: 'Bob', wallets: [to] }],
      contents: 'Hello'
    }
    const data = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        ...types
      },
      primaryType: 'Mail',
      domain,
      message
    }
    const expected = signing.sign(TypedDataEncoder.hash(domain, types, message)).serialized
    expect(await call('signTypedData', key, { data, version: 'V4' })).toBe(expected)
  })
})

describe('HD derivation matches an independent implementation', () => {
  it('derives public-key-only accounts like ethers does', async () => {
    const account = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(PHRASE), "m/44'/60'/0'/0")
    const accounts = await new Promise((resolve, reject) =>
      deriveHDAccounts(account.publicKey.slice(2), account.chainCode.slice(2), (e, r) =>
        e ? reject(e) : resolve(r)
      )
    )
    expect(accounts).toHaveLength(100)
    ;[0, 1, 50, 99].forEach((i) => expect(accounts[i]).toBe(account.deriveChild(i).address))
  })
})

describe('uuid v5 ids match RFC 4122 computed with node:crypto', () => {
  // Account, origin and device ids are stored in profiles; a changed id orphans the stored data.
  const oracle = (name, namespace) => {
    const hash = createHash('sha1')
      .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
      .update(name, 'utf8')
      .digest()
    hash[6] = (hash[6] & 0x0f) | 0x50
    hash[8] = (hash[8] & 0x3f) | 0x80
    const hex = hash.subarray(0, 16).toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  it.each([
    ['frame-internal', uuidv5.DNS],
    ['Ledger/dev/hidraw0', uuidv5.URL],
    [`native\u0000source`, uuidv5.URL],
    ['0xabc\u00e9', '6ba7b810-9dad-11d1-80b4-00c04fd430c8']
  ])('%s', (name, namespace) => {
    expect(uuidv5(name, namespace)).toBe(oracle(name, namespace))
  })
})
