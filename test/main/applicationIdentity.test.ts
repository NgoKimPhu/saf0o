import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  APPLICATION_NAME,
  INSTANCE_LOCK_DIRECTORY,
  configureApplicationIdentity,
  requestSaf0oSingleInstanceLock
} from '../../main/applicationIdentity'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

const application = (customProfile?: string) => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'saf0o-identity-'))
  roots.push(appData)
  const paths = { appData, userData: customProfile || path.join(appData, 'electron-default') }

  return {
    commandLine: { hasSwitch: jest.fn(() => Boolean(customProfile)) },
    getPath: jest.fn((name: 'appData' | 'userData') => paths[name]),
    requestSingleInstanceLock: jest.fn(() => true),
    setName: jest.fn(),
    setPath: jest.fn((name: 'userData', value: string) => {
      paths[name] = value
    })
  }
}

it('uses an independent Saf0o profile by default', () => {
  const app = application()

  configureApplicationIdentity(app)

  expect(app.setName).toHaveBeenCalledWith(APPLICATION_NAME)
  expect(app.setPath).toHaveBeenCalledWith('userData', path.join(app.getPath('appData'), 'saf0o'))
})

it('preserves an explicit isolated profile', () => {
  const app = application(path.join(os.tmpdir(), 'isolated-saf0o-profile'))

  configureApplicationIdentity(app)

  expect(app.setName).toHaveBeenCalledWith(APPLICATION_NAME)
  expect(app.setPath).not.toHaveBeenCalled()
})

it('acquires one Saf0o-wide lock without creating the wallet profile', () => {
  const profile = path.join(os.tmpdir(), 'isolated-saf0o-profile')
  const app = application(profile)
  app.requestSingleInstanceLock.mockImplementation(() => {
    expect(app.getPath('userData')).toBe(path.join(app.getPath('appData'), INSTANCE_LOCK_DIRECTORY))
    return true
  })

  expect(requestSaf0oSingleInstanceLock(app)).toBe(true)
  expect(app.getPath('userData')).toBe(profile)
  const lockPath = path.join(app.getPath('appData'), INSTANCE_LOCK_DIRECTORY)
  expect(fs.lstatSync(lockPath).isDirectory()).toBe(true)
  if (process.platform !== 'win32') expect(fs.statSync(lockPath).mode & 0o777).toBe(0o700)
})

it('rejects direct and nested access to the legacy Frame profile', () => {
  const direct = application()
  const frameProfile = path.join(direct.getPath('appData'), 'frame')
  fs.mkdirSync(frameProfile)
  direct.commandLine.hasSwitch.mockReturnValue(true)
  direct.getPath.mockImplementation((name: 'appData' | 'userData') =>
    name === 'appData' ? path.dirname(frameProfile) : frameProfile
  )

  expect(() => configureApplicationIdentity(direct)).toThrow(
    'Saf0o cannot use a profile inside the Frame profile; use --import-frame-profile instead'
  )

  direct.getPath.mockImplementation((name: 'appData' | 'userData') =>
    name === 'appData' ? path.dirname(frameProfile) : path.join(frameProfile, 'nested-saf0o')
  )
  expect(() => configureApplicationIdentity(direct)).toThrow(
    'Saf0o cannot use a profile inside the Frame profile; use --import-frame-profile instead'
  )

  const linked = application()
  const linkedFrame = path.join(linked.getPath('appData'), 'frame')
  const alias = path.join(linked.getPath('appData'), 'frame-alias')
  fs.mkdirSync(linkedFrame)
  fs.symlinkSync(linkedFrame, alias, 'dir')
  linked.commandLine.hasSwitch.mockReturnValue(true)
  linked.getPath.mockImplementation((name: 'appData' | 'userData') =>
    name === 'appData' ? path.dirname(linkedFrame) : path.join(alias, 'nested-saf0o')
  )

  expect(() => configureApplicationIdentity(linked)).toThrow(
    'Saf0o cannot use a profile inside the Frame profile; use --import-frame-profile instead'
  )
})
