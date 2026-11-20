// @trezor/* is ~25% of the startup require. It must not load until Trezor init runs after the first window.
const mockLoaded = []

jest.mock('@trezor/connect', () => {
  mockLoaded.push('@trezor/connect')
  const mock = {
    init: jest.fn(async () => undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    dispose: jest.fn()
  }
  return { __esModule: true, default: mock, DEVICE_EVENT: 'de', UI_EVENT: 'ue', UI_REQUEST: 'ur' }
})
jest.mock('@trezor/transport', () => {
  mockLoaded.push('@trezor/transport')
  return { NodeUsbTransport: class {} }
})
jest.mock('../../../../main/signers/trezor/nodeUsbTransport', () => {
  mockLoaded.push('nodeUsbTransport')
  return { FrameNodeUsbTransport: class {}, closeFrameNodeUsbTransports: jest.fn(async () => undefined) }
})

beforeEach(() => {
  mockLoaded.length = 0
  jest.resetModules()
})

it('requiring the bridge, Trezor signer and rpc handlers does not load @trezor/*', () => {
  require('../../../../main/signers/trezor/bridge')
  require('../../../../main/signers/trezor/Trezor')
  expect(mockLoaded).toEqual([])
})

it('closing a bridge that never opened does not load @trezor/*', async () => {
  const { default: bridge } = require('../../../../main/signers/trezor/bridge')
  await bridge.close()
  expect(mockLoaded).toEqual([])
})

it('open() loads @trezor/connect and runs init once', async () => {
  const { default: bridge } = require('../../../../main/signers/trezor/bridge')
  await bridge.open()
  expect(mockLoaded).toContain('@trezor/connect')
  expect(require('@trezor/connect').default.init).toHaveBeenCalledTimes(1)
})
