import { isTrezorDelegate } from '../../eip7702/delegates'
import type { Eip7702RevokeRequest, Eip7702UpgradeRequest } from '../../transaction/eip7702'

export const TREZOR_EIP7702_EXPERIMENTAL_OFF =
  'Turn on experimental features on the Trezor (Trezor Suite > Settings > Device) to sign EIP-7702 delegations.'
const FIRMWARE =
  'This Trezor cannot sign EIP-7702 delegations. It needs firmware 2.12.5 or later; Trezor One does not support them.'
const DELEGATE =
  'The Trezor firmware does not list this delegate contract for this network, so it refused to sign.'
const NETWORK = 'The Trezor does not know this network, so it refused to sign the delegation.'

// Connect payload for the one shape the firmware signs: a self-call with no value, no data
// and one authorization. Callers pass a request already parsed by its codec.
export function trezorEip7702Transaction(request: Eip7702RevokeRequest | Eip7702UpgradeRequest) {
  if (request.data !== '0x') throw new Error('Trezor signs EIP-7702 delegations only without call data')
  if (!isTrezorDelegate(BigInt(request.chainId), request.delegate)) {
    throw new Error('Trezor firmware does not allow this EIP-7702 delegate on this chain')
  }
  return {
    to: request.to,
    value: '0x0',
    data: '',
    chainId: Number(BigInt(request.chainId)),
    nonce: request.nonce,
    gasLimit: request.gasLimit,
    maxFeePerGas: request.maxFeePerGas,
    maxPriorityFeePerGas: request.maxPriorityFeePerGas,
    authorizationList: [{ address: request.delegate }]
  }
}

// Turns Connect and firmware failures into messages a user can act on.
export function trezorEip7702ErrorMessage(error: {
  message?: string | undefined
  code?: string | undefined
}) {
  const message = error.message || 'Trezor could not sign the EIP-7702 delegation'
  if (
    error.code === 'Device_FwException' ||
    error.code === 'Device_MissingCapability' ||
    message.includes('did not return an EIP-7702 authorization')
  ) {
    return FIRMWARE
  }
  if (message.includes('Unknown EIP-7702 delegate')) return DELEGATE
  if (message.includes('EIP-7702: unknown network')) return NETWORK
  // Firmware rejects the experimental auth7702 field at decode time when experimental features are off.
  if (message.includes('Failed to decode message')) return TREZOR_EIP7702_EXPERIMENTAL_OFF
  return message
}
