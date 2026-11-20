import { app, dialog } from 'electron'
import {
  confirmSensitiveAction,
  openProfileBackupDialog,
  saveProfileBackupDialog,
  showUnhandledExceptionDialog
} from '../../../../main/windows/dialog'

jest.mock('electron', () => ({
  dialog: {
    showMessageBoxSync: jest.fn(),
    showMessageBox: jest.fn(),
    showErrorBox: jest.fn(),
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn()
  },
  BrowserWindow: { getFocusedWindow: jest.fn(() => 'focused window') },
  app: {
    quit: jest.fn(),
    relaunch: jest.fn()
  }
}))
jest.mock('../../../../main/windows', () => ({ browserWindows: () => ({ dash: 'mock dash browserwindow' }) }))

describe('#showUnhandledExceptionDialog', () => {
  it('displays the error message to the user', () => {
    showUnhandledExceptionDialog('something bad happened')

    expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        detail: 'something bad happened'
      })
    )
  })

  it('gives the user an option to accept the error or quit Frame', () => {
    showUnhandledExceptionDialog('something bad happened')

    expect(dialog.showMessageBoxSync).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        buttons: ['OK', 'Quit']
      })
    )
  })

  it('will relaunch the app when the user clicks OK', () => {
    dialog.showMessageBoxSync.mockImplementation(() => 0)

    showUnhandledExceptionDialog('something bad happened')

    expect(app.relaunch).toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalled()
  })

  it('will not relaunch the app when the user clicks quit', () => {
    dialog.showMessageBoxSync.mockImplementation(() => 1)

    showUnhandledExceptionDialog('something bad happened')

    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalled()
  })

  it('shows a simple error box and quits for an EADDRINUSE error', () => {
    showUnhandledExceptionDialog('Frame is already running', 'EADDRINUSE')

    expect(dialog.showErrorBox).toHaveBeenCalled()
    expect(dialog.showMessageBoxSync).not.toHaveBeenCalled()
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalled()
  })
})

describe('profile backup dialogs', () => {
  it('opens only Saf0o backup files without exposing the selected path elsewhere', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/profile.saf0obackup'] })

    await expect(openProfileBackupDialog()).resolves.toBe('/tmp/profile.saf0obackup')
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      'focused window',
      expect.objectContaining({
        properties: ['openFile'],
        filters: [{ name: 'Saf0o profile backup', extensions: ['saf0obackup'] }]
      })
    )
  })

  it('uses a dated non-JSON filename and reports cancellation', async () => {
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/tmp/profile.saf0obackup' })
    await expect(saveProfileBackupDialog(new Date('2026-08-12T00:00:00.000Z'))).resolves.toBe(
      '/tmp/profile.saf0obackup'
    )
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      'focused window',
      expect.objectContaining({ defaultPath: 'saf0o-profile-2026-08-12.saf0obackup' })
    )

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true })
    await expect(saveProfileBackupDialog()).resolves.toBeUndefined()
  })
})

// Main-side gate for disabling OS signer protection and replacing the profile:
// anything but an explicit click on the confirm button must refuse.
describe('#confirmSensitiveAction', () => {
  const ask = () => confirmSensitiveAction('Turn off?', 'details', 'Turn off')

  it('confirms only when the user clicks the confirm button', async () => {
    dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(ask()).resolves.toBe(true)
  })

  it('refuses on Cancel, Escape or window close', async () => {
    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(ask()).resolves.toBe(false)
  })

  it('makes Cancel the default and the Escape action', async () => {
    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await ask()
    expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
      'focused window',
      expect.objectContaining({ buttons: ['Cancel', 'Turn off'], defaultId: 0, cancelId: 0 })
    )
  })
})
