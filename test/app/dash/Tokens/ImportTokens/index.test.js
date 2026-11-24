import { render, screen } from '../../../../componentSetup'
import ImportTokens, { formatBalance } from '../../../../../app/dash/Tokens/ImportTokens'
import link from '../../../../../resources/link'

jest.mock('../../../../../resources/link', () => ({ invoke: jest.fn(), send: jest.fn() }))

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const token = {
  chainId: 1,
  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Airdrop',
  symbol: 'DROP',
  decimals: 6,
  balance: '1500000'
}

const configured = {
  success: true,
  credential: { available: true, backend: 'secret_service', configured: true }
}

const setup = (invoke) => {
  link.invoke.mockImplementation(async (channel, ...args) => invoke(channel, ...args))
  return render(<ImportTokens account={ACCOUNT} chainName={(id) => `Chain ${id}`} />)
}

afterEach(() => jest.clearAllMocks())

test('formats raw balances and never shows a dust balance as zero', () => {
  expect(formatBalance('1500000', 6)).toBe('1.5')
  expect(formatBalance('1', 18)).toBe('<0.000001')
  expect(formatBalance('123', 0)).toBe('123')
})

test('selects nothing by default, so an unwanted airdrop is never imported by accident', async () => {
  const { user } = setup((channel) =>
    channel === 'tokenImport:credentialStatus'
      ? configured
      : {
          success: true,
          candidates: [token],
          skippedChainIds: [369],
          failedChainIds: [8453],
          truncated: true
        }
  )

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  await user.click(await screen.findByRole('button', { name: 'Scan account' }))

  const box = await screen.findByRole('checkbox', { name: /DROP/ })
  expect(box.checked).toBe(false)
  expect(screen.queryByRole('button', { name: /^Import \d+ selected/ })).toBeNull()
  expect(screen.getByText(/list is incomplete/)).toBeTruthy()
  expect(screen.getByText('No answer for: Chain 8453.')).toBeTruthy()
  expect(screen.getByText('Not supported by Alchemy here: Chain 369.')).toBeTruthy()
})

test('sends only chain id and address on import, so the renderer cannot change token metadata', async () => {
  const calls = []
  const { user } = setup((channel, ...args) => {
    calls.push([channel, ...args])
    if (channel === 'tokenImport:credentialStatus') return configured
    if (channel === 'tokenImport:preview') {
      return { success: true, candidates: [token], skippedChainIds: [], failedChainIds: [], truncated: false }
    }
    return { success: true, saved: 1 }
  })

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  await user.click(await screen.findByRole('button', { name: 'Scan account' }))
  await user.click(await screen.findByRole('checkbox', { name: /DROP/ }))
  await user.click(screen.getByRole('button', { name: 'Import 1 selected' }))

  expect(await screen.findByText('Imported 1 token.')).toBeTruthy()
  expect(calls.at(-1)).toEqual(['tokenImport:save', ACCOUNT, [{ chainId: 1, address: token.address }]])
})

test('says so when the OS keyring is missing instead of offering a scan', async () => {
  const { user } = setup(() => ({
    success: true,
    credential: { available: false, backend: 'unsupported', configured: false }
  }))

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))

  expect(await screen.findByText('Secure storage unavailable. Cannot use an API key.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Scan account' })).toBeNull()
})

test('points to Settings when no key is saved, since the key now lives there', async () => {
  const { user } = setup(() => ({
    success: true,
    credential: { available: true, backend: 'secret_service', configured: false }
  }))

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))

  expect(await screen.findByText(/Settings → Advanced/)).toBeTruthy()
  expect(screen.queryByLabelText('Alchemy API key')).toBeNull()
})

test('lists tokens by USD value, and select all / select above $x pick the right tokens', async () => {
  const mk = (n, usdValue) => ({
    ...token,
    address: `0x${String(n).repeat(40)}`,
    symbol: `T${n}`,
    ...(usdValue === undefined ? {} : { usdValue })
  })
  const { user } = setup((channel) =>
    channel === 'tokenImport:credentialStatus'
      ? configured
      : {
          success: true,
          candidates: [mk(1, 5), mk(2), mk(3, 500), mk(4, 150)],
          skippedChainIds: [],
          failedChainIds: [],
          truncated: false
        }
  )

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  await user.click(await screen.findByRole('button', { name: 'Scan account' }))
  await screen.findByRole('checkbox', { name: /Select all/ })

  const rows = screen.getAllByRole('listitem').map((li) => li.textContent.slice(0, 2))
  expect(rows).toEqual(['T3', 'T4', 'T1', 'T2'])

  await user.click(screen.getByRole('checkbox', { name: /Select above/ }))
  expect(screen.getByRole('button', { name: 'Import 2 selected' })).toBeTruthy()

  await user.click(screen.getByRole('checkbox', { name: /Select all/ }))
  expect(screen.getByRole('button', { name: 'Import 4 selected' })).toBeTruthy()
  await user.click(screen.getByRole('checkbox', { name: /Select all/ }))
  expect(screen.queryByRole('button', { name: /^Import \d+ selected/ })).toBeNull()
})
