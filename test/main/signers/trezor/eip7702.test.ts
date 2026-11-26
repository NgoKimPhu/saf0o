import { computeAddress, SigningKey } from 'ethers'
import type { Device as TrezorDevice } from '@trezor/connect'

import { Derivation } from '../../../../main/signers/Signer/derive'
import Trezor, { Status } from '../../../../main/signers/trezor/Trezor'
import TrezorBridge, { DeviceError } from '../../../../main/signers/trezor/bridge'
import { USER_REJECTED_REQUEST } from '../../../../main/signers/errors'
import {
  createEip7702RevokeRequest,
  createEip7702UpgradeRequest,
  signEip7702RevokeRequest,
  signEip7702UpgradeRequest
} from '../../../../main/transaction/eip7702'

const PRIVATE_KEY = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
const AUTHORITY = computeAddress(new SigningKey(PRIVATE_KEY).publicKey)
const AMBIRE = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
const fees = { nonce: 7n, gasLimit: 60_000n, maxFeePerGas: 30n, maxPriorityFeePerGas: 2n }
const upgrade = (chainId = 8453n, data = '0x') =>
  createEip7702UpgradeRequest({ authority: AUTHORITY, chainId, delegate: AMBIRE, data, ...fees })
const revoke = (chainId = 137n) => createEip7702RevokeRequest({ authority: AUTHORITY, chainId, ...fees })

function createSigner(features: Record<string, unknown> = { experimental_features: true }) {
  const signer = new Trezor('trezor-7702')
  signer.derivation = Derivation.standard
  signer.device = { path: 'trezor-7702', features } as unknown as TrezorDevice
  signer.status = Status.OK
  return signer
}

function sign(signer: Trezor, method: 'signEip7702Revoke' | 'signEip7702Authorization', request: unknown) {
  return new Promise<{ error: Error | null; raw?: string }>((resolve) => {
    void signer[method](0, request, (error, raw) => resolve({ error, ...(raw ? { raw } : {}) }))
  })
}

// The device builds and signs the type-4 tx itself. saf0o must refuse anything the firmware
// cannot sign, and must never return a signed tx that differs from the reviewed request.
describe('Trezor EIP-7702 delegation signing', () => {
  afterEach(() => jest.restoreAllMocks())

  it('signs an Ambire upgrade through Connect with one authorization and returns the inspected tx', async () => {
    const request = upgrade()
    const raw = signEip7702UpgradeRequest(PRIVATE_KEY, request)
    const bridge = jest.spyOn(TrezorBridge, 'signEip7702Transaction').mockResolvedValue(raw)

    const result = await sign(createSigner(), 'signEip7702Authorization', request)

    expect(result).toEqual({ error: null, raw })
    expect(bridge).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'trezor-7702' }),
      "m/44'/60'/0'/0/0",
      {
        to: AUTHORITY,
        value: '0x0',
        data: '',
        chainId: 8453,
        nonce: '0x7',
        gasLimit: '0xea60',
        maxFeePerGas: '0x1e',
        maxPriorityFeePerGas: '0x2',
        authorizationList: [{ address: AMBIRE }]
      }
    )
  })

  it('signs a revoke (zero delegate) on any chain', async () => {
    const request = revoke()
    const raw = signEip7702RevokeRequest(PRIVATE_KEY, request)
    jest.spyOn(TrezorBridge, 'signEip7702Transaction').mockResolvedValue(raw)

    await expect(sign(createSigner(), 'signEip7702Revoke', request)).resolves.toEqual({ error: null, raw })
  })

  it.each([
    ['nonce', { nonce: 8n }],
    ['fee', { maxFeePerGas: 31n }],
    ['gas limit', { gasLimit: 61_000n }]
  ])('rejects a device tx whose %s differs from the request', async (_label, change) => {
    const request = upgrade()
    const tampered = createEip7702UpgradeRequest({
      authority: AUTHORITY,
      chainId: 8453n,
      delegate: AMBIRE,
      data: '0x',
      ...fees,
      ...change
    })
    jest
      .spyOn(TrezorBridge, 'signEip7702Transaction')
      .mockResolvedValue(signEip7702UpgradeRequest(PRIVATE_KEY, tampered))

    const result = await sign(createSigner(), 'signEip7702Authorization', request)
    expect(result.raw).toBeUndefined()
    expect(result.error?.message).toMatch(/does not match the upgrade request/)
  })

  it('rejects a device tx on another chain or with the revoke delegate in place of the upgrade', async () => {
    jest
      .spyOn(TrezorBridge, 'signEip7702Transaction')
      .mockResolvedValueOnce(signEip7702UpgradeRequest(PRIVATE_KEY, upgrade(42161n)))
      .mockResolvedValueOnce(signEip7702RevokeRequest(PRIVATE_KEY, revoke(8453n)))

    expect((await sign(createSigner(), 'signEip7702Authorization', upgrade())).error).toBeInstanceOf(Error)
    expect((await sign(createSigner(), 'signEip7702Authorization', upgrade())).error).toBeInstanceOf(Error)
  })

  it.each([
    ['a chain the firmware does not whitelist Ambire on', upgrade(10n)],
    ['an upgrade that carries call data', upgrade(8453n, '0x1234')]
  ])('refuses %s before touching the device', async (_label, request) => {
    const bridge = jest.spyOn(TrezorBridge, 'signEip7702Transaction')

    const result = await sign(createSigner(), 'signEip7702Authorization', request)

    expect(result.error).toBeInstanceOf(Error)
    expect(bridge).not.toHaveBeenCalled()
  })

  it('asks to turn on experimental features before touching the device', async () => {
    const bridge = jest.spyOn(TrezorBridge, 'signEip7702Transaction')

    const result = await sign(createSigner({ experimental_features: false }), 'signEip7702Revoke', revoke())

    expect(result.error?.message).toMatch(/Turn on experimental features/)
    expect(bridge).not.toHaveBeenCalled()
  })

  it.each([
    ['old firmware', new DeviceError('ui-device_firmware_old', 'Device_FwException'), /firmware 2\.12\.5/],
    [
      'firmware that ignores the authorization',
      new DeviceError('Device did not return an EIP-7702 authorization. Update the firmware', 'Runtime'),
      /firmware 2\.12\.5/
    ],
    [
      'a delegate missing from the firmware whitelist',
      new DeviceError('Unknown EIP-7702 delegate address', 'Failure_DataError'),
      /does not list this delegate/
    ],
    [
      'experimental features turned off after the features were read',
      new DeviceError('Failed to decode message', 'Failure_DataError'),
      /Turn on experimental features/
    ],
    ['an unknown network', new DeviceError('EIP-7702: unknown network', 'Failure_DataError'), /does not know/]
  ])('explains %s plainly', async (_label, deviceError, message) => {
    jest.spyOn(TrezorBridge, 'signEip7702Transaction').mockRejectedValue(deviceError)

    const result = await sign(createSigner(), 'signEip7702Authorization', upgrade())

    expect(result.error?.message).toMatch(message)
  })

  it('reports a cancel on the device as a user rejection', async () => {
    jest
      .spyOn(TrezorBridge, 'signEip7702Transaction')
      .mockRejectedValue(new DeviceError('Action cancelled by user', 'Failure_ActionCancelled'))

    const result = await sign(createSigner(), 'signEip7702Revoke', revoke())

    expect(result.error).toMatchObject({ code: USER_REJECTED_REQUEST })
  })
})
