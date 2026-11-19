const crypto = require('crypto')
const { signTypedData, personalSign } = require('@metamask/eth-sig-util')
const { createTx } = require('@ethereumjs/tx')
const { Common, Mainnet, createCustomCommon, getPresetChainConfig } = require('@ethereumjs/common')
const {
  hashPersonalMessage,
  toBytes,
  bytesToHex,
  pubToAddress,
  ecrecover
} = require('@ethereumjs/util')
const { encryptSecret } = require('../crypto')

function chainConfig(chain, hardfork) {
  const chainId = BigInt(chain)
  const preset = getPresetChainConfig(chain)

  return BigInt(preset.chainId) === chainId
    ? new Common({ chain: preset, hardfork })
    : createCustomCommon({ chainId: chain }, Mainnet, { hardfork })
}

class HotSignerWorker {
  constructor() {
    this.token = crypto.randomBytes(32).toString('hex')
    try {
      process.send({ type: 'token', token: this.token }, (error) => {
        if (error) process.exitCode = 1
      })
    } catch {
      process.exitCode = 1
    }
  }

  handleMessage(message = {}) {
    const { id, method, params, token } = message
    let settled = false
    const pseudoCallback = (error, result) => {
      if (settled) return
      settled = true

      const normalizedError = error instanceof Error ? error.message : error
      try {
        process.send({ id, error: normalizedError, result, type: 'rpc' }, (sendError) => {
          if (sendError) process.exitCode = 1
        })
      } catch {
        // The parent process owns worker-disconnect recovery.
      }
    }

    try {
      if (typeof token !== 'string') return pseudoCallback('Invalid token')

      const candidate = Buffer.from(token)
      const expected = Buffer.from(this.token)
      if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
        return pseudoCallback('Invalid token')
      }

      if (
        typeof method !== 'string' ||
        method === 'constructor' ||
        method === 'handleMessage' ||
        method.startsWith('_') ||
        typeof this[method] !== 'function'
      ) {
        return pseudoCallback(`Invalid method: '${method}'`)
      }

      const result = this[method](params, pseudoCallback)
      if (result && typeof result.then === 'function') {
        result.catch((error) => pseudoCallback(error))
      }
    } catch (error) {
      pseudoCallback(error)
    }
  }

  signMessage(key, message, pseudoCallback) {
    // Hash and sign the message as r || s || v
    pseudoCallback(null, personalSign({ privateKey: key, data: toBytes(message) }))
  }

  signTypedData(key, typedMessage, pseudoCallback) {
    try {
      const { data, version } = typedMessage
      const signature = signTypedData({ privateKey: key, data, version })
      pseudoCallback(null, signature)
    } catch (e) {
      pseudoCallback(e.message)
    }
  }

  signTransaction(key, rawTx, pseudoCallback) {
    if (!rawTx.chainId) {
      console.error(`invalid chain id ${rawTx.chainId} for transaction`)
      return pseudoCallback('could not determine chain id for transaction')
    }

    const chainId = parseInt(rawTx.chainId, 16)
    const hardfork = parseInt(rawTx.type) === 2 ? 'london' : 'berlin'
    const common = chainConfig(chainId, hardfork)

    const tx = createTx(rawTx, { common })
    const signedTx = tx.sign(key)
    const serialized = bytesToHex(signedTx.serialize())

    pseudoCallback(null, serialized)
  }

  signEip7702Revoke(key, request, pseudoCallback) {
    try {
      // This module is TypeScript in the source tree and JavaScript in compiled workers.
      // Loading it only for this method keeps source-mode legacy signer tests bootable.
      const { signEip7702RevokeRequest } = require('../../../transaction/eip7702')
      pseudoCallback(null, signEip7702RevokeRequest(key, request))
    } catch (error) {
      pseudoCallback(error)
    }
  }

  verifyAddress({ index, address }, pseudoCallback) {
    const message = '0x' + crypto.randomBytes(32).toString('hex')
    this.signMessage({ index, message }, (err, signedMessage) => {
      // Handle signing errors
      if (err) return pseudoCallback(err)
      // Signature -> buffer
      const signature = Buffer.from(signedMessage.replace('0x', ''), 'hex')
      // Ensure correct length
      if (signature.length !== 65)
        return pseudoCallback(new Error('Wren verifyAddress signature has incorrect length'))
      // Verify address
      let v = signature[64]
      v = BigInt(v === 0 || v === 1 ? v + 27 : v)
      const r = toBytes(signature.subarray(0, 32))
      const s = toBytes(signature.subarray(32, 64))
      const hash = hashPersonalMessage(toBytes(message))
      const verifiedAddress = bytesToHex(pubToAddress(ecrecover(hash, v, r, s)))
      // Return result
      pseudoCallback(null, verifiedAddress.toLowerCase() === address.toLowerCase())
    })
  }

  _encrypt(string, password) {
    return encryptSecret(string, password)
  }
}

module.exports = HotSignerWorker
