import { AbiCoder, Transaction } from 'ethers'

import { createRpcProvider, estimateL1GasCost, GAS_PRICE_ORACLE_ADDRESS } from '../../../main/chains/optimism'

const encodedFee = AbiCoder.defaultAbiCoder().encode(['uint256'], ['123456789'])

function createProvider() {
  return {
    call: jest.fn().mockResolvedValue(encodedFee),
    getTransactionCount: jest.fn().mockResolvedValue(7)
  }
}

const fixtures = [
  {
    name: 'legacy transaction with the fallback nonce',
    tx: {
      chainId: 10,
      type: 0,
      to: '0x1111111111111111111111111111111111111111',
      gasLimit: 21000,
      gasPrice: 1000000,
      value: 1,
      data: '0x'
    },
    calldata:
      '0x49948e0e00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000027e684ffffffff830f424082520894111111111111111111111111111111111111111101800a808000000000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-2930 transaction with an explicit zero nonce',
    tx: {
      chainId: 10,
      type: 1,
      nonce: 0,
      to: '0x2222222222222222222222222222222222222222',
      gasLimit: 50000,
      gasPrice: 2000000,
      value: 0,
      data: '0x1234',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002501e30a80831e848082c35094222222222222222222222222222222222222222280821234c0000000000000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with the fallback nonce',
    tx: {
      chainId: 10,
      type: 2,
      to: '0x1111111111111111111111111111111111111111',
      gasLimit: 21000,
      maxFeePerGas: 3000000,
      maxPriorityFeePerGas: 1000000,
      value: 1,
      data: '0x',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002b02e90a84ffffffff830f4240832dc6c08252089411111111111111111111111111111111111111110180c0000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with an explicit zero nonce',
    tx: {
      chainId: 10,
      type: 2,
      nonce: 0,
      to: '0x2222222222222222222222222222222222222222',
      gasLimit: 50000,
      maxFeePerGas: 4000000,
      maxPriorityFeePerGas: 2000000,
      value: 0,
      data: '0x1234',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002902e70a80831e8480833d090082c35094222222222222222222222222222222222222222280821234c00000000000000000000000000000000000000000000000'
  },
  {
    name: 'EIP-1559 transaction with a provider nonce',
    tx: {
      chainId: 10,
      type: 2,
      from: '0x3333333333333333333333333333333333333333',
      to: '0x4444444444444444444444444444444444444444',
      gasLimit: 65000,
      maxFeePerGas: 5000000,
      maxPriorityFeePerGas: 3000000,
      value: 2,
      data: '0xa9059cbb',
      accessList: []
    },
    calldata:
      '0x49948e0e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002b02e90a07832dc6c0834c4b4082fde89444444444444444444444444444444444444444440284a9059cbbc0000000000000000000000000000000000000000000'
  }
]

describe('OP Stack L1 fee estimation', () => {
  it('adapts callback JSON-RPC providers without changing payloads', async () => {
    const callbackProvider = {
      sendAsync: jest.fn((payload, callback) => {
        const result = payload.method === 'eth_call' ? encodedFee : '0x7'
        callback(null, { result })
      })
    }
    const provider = createRpcProvider(callbackProvider)
    const call = { to: GAS_PRICE_ORACLE_ADDRESS, data: '0x1234' }

    await expect(provider.call(call)).resolves.toBe(encodedFee)
    await expect(provider.getTransactionCount('0x3333333333333333333333333333333333333333')).resolves.toBe(7)
    expect(callbackProvider.sendAsync.mock.calls.map(([payload]) => payload)).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [call, 'latest'] },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionCount',
        params: ['0x3333333333333333333333333333333333333333', 'latest']
      }
    ])
  })

  it('rejects callback transport and JSON-RPC errors', async () => {
    const transportFailure = createRpcProvider({
      sendAsync: (_payload, callback) => callback(new Error('transport unavailable'))
    })
    const rpcFailure = createRpcProvider({
      sendAsync: (_payload, callback) => callback(null, { error: { message: 'execution reverted' } })
    })

    await expect(transportFailure.call({ to: GAS_PRICE_ORACLE_ADDRESS, data: '0x' })).rejects.toThrow(
      'transport unavailable'
    )
    await expect(rpcFailure.call({ to: GAS_PRICE_ORACLE_ADDRESS, data: '0x' })).rejects.toThrow(
      'execution reverted'
    )
  })

  it.each(fixtures)('encodes $name', async ({ tx, calldata }) => {
    const provider = createProvider()

    const fee = await estimateL1GasCost(provider, tx)

    expect(fee.toString()).toBe('123456789')
    expect(provider.call).toHaveBeenCalledWith({
      to: GAS_PRICE_ORACLE_ADDRESS,
      data: calldata
    })

    if (tx.from && tx.nonce === undefined) {
      expect(provider.getTransactionCount).toHaveBeenCalledWith(tx.from)
    } else {
      expect(provider.getTransactionCount).not.toHaveBeenCalled()
    }
  })

  it('rejects unsupported transaction envelopes before making an RPC call', async () => {
    const provider = createProvider()

    await expect(estimateL1GasCost(provider, { type: 3 })).rejects.toThrow(
      'Unsupported OP Stack transaction type: 3'
    )
    expect(provider.call).not.toHaveBeenCalled()
  })

  it('propagates GasPriceOracle RPC errors', async () => {
    const provider = createProvider()
    provider.call.mockRejectedValue(new Error('oracle unavailable'))

    await expect(estimateL1GasCost(provider, { chainId: 10, type: 2 })).rejects.toThrow('oracle unavailable')
  })
})

describe('EIP-7702 upgrade pricing', () => {
  const tx = {
    chainId: 10,
    type: 2,
    nonce: 4,
    to: '0x1111111111111111111111111111111111111111',
    gasLimit: 100000,
    maxFeePerGas: 3000000,
    maxPriorityFeePerGas: 1000000,
    value: 0,
    data: '0xabc5345e'
  }
  const delegate = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
  const pricedBytes = async (request) => {
    const provider = createProvider()
    await estimateL1GasCost(provider, request)
    const [encoded] = provider.call.mock.calls[0]
    return AbiCoder.defaultAbiCoder().decode(['bytes'], '0x' + encoded.data.slice(10))[0]
  }

  it('prices the upgrade as the type-4 transaction it signs, authorization included', async () => {
    // A type-2 shape omits the authorization tuple, so the OP-stack L1 fee came out low.
    const plain = await pricedBytes(tx)
    const upgrade = await pricedBytes({ ...tx, authorizationDelegate: delegate })
    const parsed = Transaction.from(upgrade)

    expect(parsed.type).toBe(4)
    expect(parsed.authorizationList).toHaveLength(1)
    expect(parsed.authorizationList[0].address).toBe(delegate)
    expect(parsed.authorizationList[0].nonce).toBe(5n)
    expect(parsed.authorizationList[0].chainId).toBe(10n)
    expect((upgrade.length - plain.length) / 2).toBeGreaterThanOrEqual(85)
  })

  it('refuses an authorization on a non-1559 fee shape', async () => {
    await expect(
      estimateL1GasCost(createProvider(), { ...tx, type: 0, gasPrice: 1, authorizationDelegate: delegate })
    ).rejects.toThrow('type-2 fee shape')
  })
})
