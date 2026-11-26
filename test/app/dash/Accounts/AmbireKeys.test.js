import { render, screen } from '../../../componentSetup'
import { AmbireKeys } from '../../../../app/dash/Accounts/AmbireKeys'
import link from '../../../../resources/link'

jest.mock('../../../../resources/link', () => ({ rpc: jest.fn(), send: jest.fn() }))

const account = '0x0000000000000000000000000000000000000001'
const activeKey = '0x2222222222222222222222222222222222222222'
const inactiveKey = '0x3333333333333333333333333333333333333333'
const newKey = '0x4444444444444444444444444444444444444444'
const handlerId = '00000000-0000-4000-8000-000000000001'

const answer = (keys) =>
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAmbireKeys') callback(null, keys)
    if (method === 'requestAmbireKeyChange') callback(null, { account, handlerId, type: 'transaction' })
  })

beforeEach(() => {
  link.rpc.mockReset()
  link.send.mockReset()
})

// Key changes are account-control changes, so the dash only asks main for a reviewed self-call
// and hands the user to the normal transaction approval.
it('lists live keys and opens the approval for an add or a remove', async () => {
  answer({
    account,
    chainId: 1,
    supported: true,
    keys: [
      { address: activeKey, privilege: `0x${'0'.repeat(63)}1` },
      { address: inactiveKey, privilege: `0x${'0'.repeat(64)}` }
    ]
  })
  const { user } = render(<AmbireKeys account={account} chainId={1} />)

  expect(await screen.findByText(activeKey)).toBeTruthy()
  expect(screen.getByText('Inactive')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: 'Remove' }))
  expect(link.rpc).toHaveBeenCalledWith(
    'requestAmbireKeyChange',
    account,
    1,
    activeKey,
    false,
    expect.any(Function)
  )

  expect(screen.getByRole('button', { name: 'Add key' }).disabled).toBe(true)
  await user.type(screen.getByLabelText('Key address'), newKey)
  await user.click(screen.getByRole('button', { name: 'Add key' }))
  expect(link.rpc).toHaveBeenCalledWith(
    'requestAmbireKeyChange',
    account,
    1,
    newKey,
    true,
    expect.any(Function)
  )
  expect(link.send).toHaveBeenCalledWith('nav:forward', 'panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account, requestId: handlerId }
  })
})

it('offers nothing when the account is not delegated to Ambire', () => {
  answer({ account, chainId: 1, supported: false, keys: [] })
  render(<AmbireKeys account={account} chainId={1} />)

  expect(screen.queryByRole('button', { name: 'Add key' })).toBeNull()
})
