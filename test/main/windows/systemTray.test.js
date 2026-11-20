let mockTemplate

jest.mock('getos', () => jest.fn())
jest.mock('electron', () => ({
  app: { quit: jest.fn() },
  screen: {},
  Menu: {
    buildFromTemplate: jest.fn((template) => {
      mockTemplate = template
      return {}
    })
  },
  Tray: jest.fn(() => ({ on: jest.fn(), setContextMenu: jest.fn(), destroy: jest.fn() }))
}))

const { SystemTray } = require('../../../main/windows/systemTray')

const setup = () => {
  const handlers = { click: jest.fn(), clickShow: jest.fn(), clickHide: jest.fn(), clickReloadUI: jest.fn() }
  const systemTray = new SystemTray(handlers)
  systemTray.init({ getBounds: jest.fn() })
  systemTray.setContextMenu('show', { switchScreen: true })
  return { handlers }
}

it('offers Reload UI so a stuck renderer can reset without restarting main', () => {
  const { handlers } = setup()
  const item = mockTemplate.find((entry) => entry.label === 'Reload UI')

  item.click()

  expect(handlers.clickReloadUI).toHaveBeenCalledTimes(1)
  expect(mockTemplate.map((entry) => entry.label)).toEqual(['Show Saf0o', 'Saf0o', 'Reload UI', 'Quit'])
})
