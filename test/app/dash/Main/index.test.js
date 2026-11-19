import Restore from 'react-restore'

import { Main } from '../../../../app/dash/Main'
import {
  WREN_COMPANION_CHROME_WEB_STORE_URL,
  WREN_COMPANION_FIREFOX_ADDONS_URL,
  WREN_SUPPORT_URL
} from '../../../../resources/constants'
import link from '../../../../resources/link'
import { fireEvent, render, screen } from '../../../componentSetup'

jest.mock('../../../../resources/link', () => ({ send: jest.fn() }))

const instanceId = '11111111-1111-4111-8111-111111111111'

const renderMain = () => {
  const store = Restore.create(
    {
      main: {
        instanceId,
        latticeSettings: { endpointCustom: '', endpointMode: 'default' },
        networks: {}
      }
    },
    {}
  )
  class TestMain extends Main {
    constructor(props) {
      super(props, { store })
      this.store = store
    }
  }
  return render(<TestMain />)
}

it.each([
  ['Earn', 'earn'],
  ['Contacts', 'addressBook'],
  ['Read-only inspector', 'inspector'],
  ['Contracts', 'contracts'],
  ['Tokens', 'tokens']
])('opens %s from the dashboard', (label, view) => {
  renderMain()

  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}\\b`) }))

  expect(link.send).toHaveBeenCalledWith('tray:action', 'navDash', { view, data: {} })
})

it('includes each tool description in its accessible name', () => {
  renderMain()

  expect(
    screen.getByRole('button', {
      name: 'Contacts Save labels for addresses. Compare the full address before signing.'
    })
  ).toBeTruthy()
})

it('routes Chrome to its Web Store listing', () => {
  renderMain()

  fireEvent.click(screen.getByRole('button', { name: 'Download Chrome companion' }))

  expect(WREN_COMPANION_CHROME_WEB_STORE_URL).toBe(
    'https://chromewebstore.google.com/detail/wren-companion/ifimccfajfbgligbhcgfapdagpnfkbhn'
  )
  expect(link.send).toHaveBeenCalledWith('tray:openExternal', WREN_COMPANION_CHROME_WEB_STORE_URL)
})

it('keeps Firefox on companion releases while store approval is pending', () => {
  renderMain()

  fireEvent.click(screen.getByRole('button', { name: 'Download Firefox companion' }))

  expect(link.send).toHaveBeenCalledWith('tray:openExternal', WREN_COMPANION_FIREFOX_ADDONS_URL)
})

it('routes support, tutorial, and quit actions', () => {
  renderMain()

  fireEvent.click(screen.getByRole('button', { name: 'Report an issue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Quit Wren' }))

  expect(link.send.mock.calls).toEqual([
    ['tray:openExternal', WREN_SUPPORT_URL],
    ['tray:action', 'navDash', { view: 'accounts', data: { showAddAccounts: true } }],
    ['tray:quit']
  ])
})

it('has no support-address copy or QR control', () => {
  renderMain()

  expect(screen.queryByRole('button', { name: 'Support Wren' })).toBeNull()
  expect(screen.queryByRole('img', { name: 'QR code for the support address' })).toBeNull()
})

it('returns the workspace home to its top-level navigation', () => {
  const scroll = document.createElement('div')
  scroll.className = 'dashMainScroll'
  scroll.scrollTop = 240
  document.body.appendChild(scroll)

  renderMain()

  expect(scroll.scrollTop).toBe(0)
  scroll.remove()
})
