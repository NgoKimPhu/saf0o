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

test('repairs a config written with the array form', async () => {
  const file = path.join(mockUserData, 'config.json')
  const holes = Array(77)
    .fill(null)
    .concat([{ main: { _version: 77, colorway: 'light' } }])
  fs.writeFileSync(file, JSON.stringify({ main: { __: holes } }))

  const store = await load()
  expect(store.get('main.__')).toEqual({ 77: { main: { _version: 77, colorway: 'light' } } })
})
