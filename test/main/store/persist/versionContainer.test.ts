import fs from 'fs'
import os from 'os'
import path from 'path'

let mockUserData: string
jest.mock('electron', () => ({ app: { on: jest.fn(), getPath: jest.fn(() => mockUserData) } }))
jest.mock('electron-log', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))

const load = async () => {
  jest.resetModules()
  jest.spyOn(global, 'setInterval').mockReturnValue(0 as unknown as NodeJS.Timeout)
  return (await import('../../../../main/store/persist')).default
}

beforeEach(() => {
  mockUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-'))
})
afterEach(() => fs.rmSync(mockUserData, { recursive: true, force: true }))

// Regression: conf 16 wrote `__` as an array, so every start ignored the saved state and re-ran migrations.
test('saved state round-trips across a restart as a version-keyed object', async () => {
  const first = await load()
  first.set('main', { _version: 77, colorway: 'light' })

  const second = await load()
  const versions = second.get('main.__') as unknown
  expect(Array.isArray(versions)).toBe(false)
  expect(versions).toEqual({ 77: { main: { _version: 77, colorway: 'light' } } })
})

// conf 16 (dot-prop 10) makes a numeric segment under a missing parent an array index. A chain id
// in a queued path would then save as an array with thousands of null slots.
test('a numeric segment under a missing parent saves as an object key', async () => {
  const store = await load()
  store.set('main', { _version: 77 })
  store.queue('main.networksMeta.ethereum.137', { gas: 'x' })
  store.writeUpdates()

  const onDisk = JSON.parse(fs.readFileSync(path.join(mockUserData, 'config.json'), 'utf8'))
  expect(onDisk.main.__).toEqual({
    77: { main: { _version: 77, networksMeta: { ethereum: { 137: { gas: 'x' } } } } }
  })
})

test('ignores prototype segments in a path', async () => {
  const store = await load()
  store.set('main', { _version: 77 })
  store.queue('main.__proto__.polluted', true)
  store.writeUpdates()

  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})
