// Plain JS so the signer workers, forked from source in tests, can load it.
const net = require('net')

const isLoopback = (host) =>
  host === 'localhost' || host === '::1' || host.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(host)

// Every Node connection (http, https, undici fetch, ws, tls) reaches net.Socket.prototype.connect.
const connectTarget = (args) => {
  let first = args[0]
  if (Array.isArray(first)) first = first[0] // Node passes normalized [options, callback]
  if (first && typeof first === 'object') {
    if (first.path) return undefined // local IPC socket or pipe
    return { host: typeof first.host === 'string' ? first.host : 'localhost', port: first.port }
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: first }
  }
  return undefined // string path: local IPC
}

// permit(host, port) returns false to block. The socket then errors with EGRESS_BLOCKED.
const patchConnect = (permit) => {
  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    const target = connectTarget(args)
    if (target && !permit(target.host.replace(/^\[|\]$/g, '').toLowerCase(), target.port)) {
      const error = Object.assign(new Error(`Outbound connection blocked: ${target.host}`), {
        code: 'EGRESS_BLOCKED'
      })
      process.nextTick(() => this.destroy(error))
      return this
    }
    return connect.apply(this, args)
  }
}

// Signer workers hold decrypted keys and need no network.
const denyAllButLoopback = () => patchConnect(isLoopback)

module.exports = { isLoopback, patchConnect, denyAllButLoopback }
