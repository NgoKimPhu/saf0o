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
      : { success: true, candidates: [token], skippedChainIds: [369], failedChainIds: [8453] }
  )

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  await user.click(await screen.findByRole('button', { name: 'Scan account' }))

  const box = await screen.findByRole('checkbox')
  expect(box.checked).toBe(false)
  expect(screen.queryByRole('button', { name: /^Import \d+ selected/ })).toBeNull()
  expect(screen.getByText('No answer for: Chain 8453.')).toBeTruthy()
  expect(screen.getByText('Not supported by Alchemy here: Chain 369.')).toBeTruthy()
})

test('sends only chain id and address on import, so the renderer cannot change token metadata', async () => {
  const calls = []
  const { user } = setup((channel, ...args) => {
    calls.push([channel, ...args])
    if (channel === 'tokenImport:credentialStatus') return configured
    if (channel === 'tokenImport:preview') {
      return { success: true, candidates: [token], skippedChainIds: [], failedChainIds: [] }
    }
    return { success: true, saved: 1 }
  })

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  await user.click(await screen.findByRole('button', { name: 'Scan account' }))
  await user.click(await screen.findByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Import 1 selected' }))

  expect(await screen.findByText('Imported 1 token.')).toBeTruthy()
  expect(calls.at(-1)).toEqual(['tokenImport:save', ACCOUNT, [{ chainId: 1, address: token.address }]])
})

test('says so when the OS keyring is missing instead of offering a key field', async () => {
  const { user } = setup(() => ({
    success: true,
    credential: { available: false, backend: 'unsupported', configured: false }
  }))

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))

  expect(await screen.findByText('Secure storage unavailable. Cannot save an API key.')).toBeTruthy()
  expect(screen.queryByLabelText('Alchemy API key')).toBeNull()
})

test('clears the key field after saving and never echoes the key back', async () => {
  const key = 'AbCdEf0123456789_alchemy_secret_key'
  const { user } = setup((channel) =>
    channel === 'tokenImport:credentialStatus'
      ? { success: true, credential: { available: true, backend: 'secret_service', configured: false } }
      : configured
  )

  await user.click(screen.getByRole('button', { name: 'Import from Alchemy' }))
  const input = await screen.findByLabelText('Alchemy API key')
  await user.type(input, key)
  await user.click(screen.getByRole('button', { name: 'Save key' }))

  expect(await screen.findByRole('button', { name: 'Scan account' })).toBeTruthy()
  expect(link.invoke).toHaveBeenCalledWith('tokenImport:saveCredential', key)
  expect(document.body.textContent).not.toContain(key)
})
