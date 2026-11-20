const { EventEmitter } = require('events')

const mockApp = new EventEmitter()
jest.mock('electron', () => ({ app: mockApp }))

const afterFirstWindow = require('../../../../main/signers/trezor/afterFirstWindow').default

beforeEach(() => {
  jest.useFakeTimers()
  mockApp.removeAllListeners()
})
afterEach(() => jest.useRealTimers())

it('does not start before a window paints, then starts once', () => {
  const fn = jest.fn()
  afterFirstWindow(fn)
  const win = new EventEmitter()
  mockApp.emit('browser-window-created', {}, win)
  jest.runAllTicks()
  jest.advanceTimersByTime(1000)
  expect(fn).not.toHaveBeenCalled()

  win.emit('ready-to-show')
  win.emit('ready-to-show')
  jest.advanceTimersByTime(1)
  expect(fn).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(60_000)
  expect(fn).toHaveBeenCalledTimes(1)
})

it('falls back to a timer when no window appears', () => {
  const fn = jest.fn()
  afterFirstWindow(fn, 500)
  jest.advanceTimersByTime(501)
  expect(fn).toHaveBeenCalledTimes(1)
})
