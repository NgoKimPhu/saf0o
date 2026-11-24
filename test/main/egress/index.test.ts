import net from 'net'
import log from 'electron-log'

import { egressMode, installNodeGuard, installSessionGuard, setDynamicHosts } from '../../../main/egress'
import { denyAllButLoopback } from '../../../main/egress/connect'

jest.mock('electron-log', () => ({ warn: jest.fn() }))

const original = net.Socket.prototype.connect
let reached: jest.Mock

beforeEach(() => {
  jest.useRealTimers()
  // The guard delegates to whatever connect it wraps; a stub keeps the test off the network.
  reached = jest.fn(function (this: net.Socket) {
    return this
  })
  net.Socket.prototype.connect = reached as unknown as typeof original
  setDynamicHosts(() => [])
})

afterEach(() => {
  net.Socket.prototype.connect = original
})

const blockedError = (socket: net.Socket) =>
  new Promise<NodeJS.ErrnoException>((resolve) => socket.once('error', resolve))

// A compromised dependency exfiltrates by connecting out. Enforce mode must stop the socket before
// it reaches DNS or the network.
test('enforce mode blocks an unlisted host before connecting', async () => {
  installNodeGuard('enforce')
  const socket = new net.Socket()
  const error = blockedError(socket)
  socket.connect({ host: 'exfil.invalid', port: 443 })

  expect((await error).code).toBe('EGRESS_BLOCKED')
  expect(reached).not.toHaveBeenCalled()
})

test('enforce mode passes loopback, listed services and runtime RPC hosts', () => {
  installNodeGuard('enforce')
  setDynamicHosts(() => ['rpc.custom.example'])

  new net.Socket().connect(1248, '127.0.0.1')
  new net.Socket().connect({ host: 'api.github.com', port: 443 })
  new net.Socket().connect({ host: 'ethereum-rpc.publicnode.com', port: 443 })
  new net.Socket().connect({ host: 'rpc.custom.example', port: 443 })
  new net.Socket().connect({ host: 'lb.drpc.org', port: 443 })
  new net.Socket().connect({ path: '/tmp/ipc.sock' })

  expect(reached).toHaveBeenCalledTimes(6)
})

// The guard must block without any setup; log-only is an explicit opt-out.
test('enforce is the default mode', () => {
  const env = process.env['SAF0O_EGRESS']
  delete process.env['SAF0O_EGRESS']
  expect(egressMode()).toBe('enforce')
  process.env['SAF0O_EGRESS'] = 'log'
  expect(egressMode()).toBe('log')
  process.env['SAF0O_EGRESS'] = 'anything'
  expect(egressMode()).toBe('enforce')
  if (env === undefined) delete process.env['SAF0O_EGRESS']
  else process.env['SAF0O_EGRESS'] = env
})

// Log mode exists to collect the real host list without breaking anything.
test('log mode lets an unlisted host through and logs it once', () => {
  installNodeGuard('log')
  new net.Socket().connect({ host: 'unlisted.example', port: 443 })
  new net.Socket().connect({ host: 'unlisted.example', port: 443 })

  expect(reached).toHaveBeenCalledTimes(2)
  expect(log.warn).toHaveBeenCalledTimes(1)
  expect(log.warn).toHaveBeenCalledWith('egress unlisted: node unlisted.example:443')
})

// Signer workers hold decrypted keys; even a listed service is off limits there.
test('deny-all blocks listed services but keeps loopback', async () => {
  denyAllButLoopback()
  const socket = new net.Socket()
  const error = blockedError(socket)
  socket.connect({ host: 'api.github.com', port: 443 })
  new net.Socket().connect(1248, 'localhost')

  expect((await error).code).toBe('EGRESS_BLOCKED')
  expect(reached).toHaveBeenCalledTimes(1)
})

// RPC URLs often carry API keys in the path, so the log names the host only.
test('the session guard cancels unlisted renderer requests and never logs the path', () => {
  let listener: (
    details: { url: string; resourceType?: string },
    callback: (response: { cancel?: boolean }) => void
  ) => void = () => {}
  const session = { webRequest: { onBeforeRequest: (fn: typeof listener) => (listener = fn) } }
  installSessionGuard(session as never, 'enforce')

  const decide = (url: string, resourceType = 'xhr') => {
    let cancel: boolean | undefined
    listener({ url, resourceType }, (response) => (cancel = response.cancel))
    return cancel
  }

  expect(decide('https://leak.example/v1/secret-key?addr=0xabc')).toBe(true)
  expect(decide('https://api.etherscan.io/v2/api')).toBe(false)
  expect(decide('file:///app/tray/index.html')).toBeUndefined()
  // Token logos load from arbitrary logoURI hosts; blocking them would blank the balances list.
  expect(decide('https://assets.coingecko.com/coins/images/1/large/x.png', 'image')).toBeUndefined()
  expect(decide('https://assets.coingecko.com/api/leak', 'script')).toBe(true)
  expect(log.warn).toHaveBeenCalledWith('egress blocked: chromium leak.example:')
  expect(JSON.stringify((log.warn as jest.Mock).mock.calls)).not.toContain('secret-key')
})
