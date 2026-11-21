import { render, screen } from '../../../componentSetup'
import BalancePreview from '../../../../resources/Components/BalancePreview'

const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const scam = '0x4444444444444444444444444444444444444444'

const preview = (overrides = {}) => ({
  key: 'k',
  assessedAt: 0,
  enriched: true,
  tokens: { [usdc]: { symbol: 'USDC', decimals: 6, known: true } },
  changes: [
    { asset: 'native', standard: 'native', delta: '310000000000000000', usd: 998 },
    { asset: usdc, standard: 'erc20', delta: '-1000000000', usd: -1000 }
  ],
  ...overrides
})

it('shows net amounts with USD, sends first, and a total', () => {
  render(<BalancePreview preview={preview()} symbol='ETH' />)
  const sent = screen.getByText('−$1,000.00')
  const received = screen.getByText('+$998.00')
  expect(sent.compareDocumentPosition(received) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Total')).toBeTruthy()
  expect(screen.getByText('−$2.00')).toBeTruthy()
  expect(screen.getAllByTestId('display-value').map(({ textContent }) => textContent)).toEqual([
    '1,000USDC',
    '0.31ETH'
  ])
  expect(screen.getByText(/DefiLlama/)).toBeTruthy()
})

it('prints the short address next to an unknown token so a spoofed symbol is visible', () => {
  const unknown = preview({
    tokens: { [scam]: { symbol: 'USDC', decimals: 18, known: false } },
    changes: [{ asset: scam, standard: 'erc20', delta: '5000000000000000000' }]
  })
  render(<BalancePreview preview={unknown} symbol='ETH' />)
  expect(screen.getByText('0x4444…4444')).toBeTruthy()
  expect(screen.getByText('no price')).toBeTruthy()
})

it('shows the swap-loss alert only when a loss is present', () => {
  const loss = preview({
    changes: [
      { asset: 'native', standard: 'native', delta: '100000000000000000', usd: 500 },
      { asset: usdc, standard: 'erc20', delta: '-1000000000', usd: -1000 }
    ]
  })
  const { unmount } = render(<BalancePreview preview={loss} symbol='ETH' />)
  expect(screen.getByRole('alert').textContent).toMatch(/Receives about 50% less than it sends/)
  unmount()
  render(<BalancePreview preview={preview()} symbol='ETH' />)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('counts NFT items without a price', () => {
  render(
    <BalancePreview
      preview={preview({ tokens: {}, changes: [{ asset: scam, standard: 'erc721', delta: '2' }] })}
      symbol='ETH'
    />
  )
  expect(screen.getByText('2 items')).toBeTruthy()
  expect(screen.queryByText('no price')).toBeNull()
})
