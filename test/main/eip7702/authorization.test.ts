import { computeAddress, SigningKey } from 'ethers'

import {
  signSoftwareEip7702Authorization,
  type SoftwareEip7702AuthorizationSigner
} from '../../../main/eip7702/authorization'
import { createEip7702UpgradeRequest, signEip7702UpgradeRequest } from '../../../main/transaction/eip7702'

const PRIVATE_KEY = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
const AUTHORITY = computeAddress(new SigningKey(PRIVATE_KEY).publicKey)
const request = createEip7702UpgradeRequest({
  authority: AUTHORITY,
  chainId: 1n,
  nonce: 3n,
  delegate: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
  data: '0x1234',
  gasLimit: 200_000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n
})

function createSigner(overrides: Partial<SoftwareEip7702AuthorizationSigner> = {}) {
  const signer: SoftwareEip7702AuthorizationSigner = {
    type: 'seed',
    status: 'ok',
    addresses: [AUTHORITY],
    signEip7702Authorization: (_index, workerRequest, callback) => {
      callback(null, signEip7702UpgradeRequest(PRIVATE_KEY, workerRequest))
    },
    ...overrides
  }
  return signer
}

// Main never trusts the worker's bytes: the signed upgrade must match the reviewed request, and
// only an unlocked software signer that holds the authority may sign it.
describe('software EIP-7702 upgrade signing', () => {
  it('returns the raw transaction with evidence checked against the request', async () => {
    await expect(signSoftwareEip7702Authorization(createSigner(), 0, request)).resolves.toMatchObject({
      rawTransaction: expect.stringMatching(/^0x04/),
      evidence: { authority: AUTHORITY, chainId: '0x1', nonce: '0x3', authorizationNonce: '0x4' }
    })
  })

  it.each([
    ['hardware signer', { type: 'trezor' }],
    ['locked signer', { status: 'locked' }],
    ['wrong address', { addresses: ['0x1111111111111111111111111111111111111111'] }]
  ])('rejects a %s', async (_label, overrides) => {
    await expect(signSoftwareEip7702Authorization(createSigner(overrides), 0, request)).rejects.toThrow()
  })

  it('rejects worker output that does not match the request', async () => {
    const signer = createSigner({
      signEip7702Authorization: (_index, workerRequest, callback) =>
        callback(null, signEip7702UpgradeRequest(PRIVATE_KEY, { ...workerRequest, data: '0x5678' }))
    })
    await expect(signSoftwareEip7702Authorization(signer, 0, request)).rejects.toThrow('does not match')
  })
})
