import {
  netBalanceChanges,
  summarizeBalancePreview,
  usdOf
} from '../../../../resources/domain/transaction/balanceChanges'

const account = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const nft = '0x3333333333333333333333333333333333333333'
const zero = '0x0000000000000000000000000000000000000000'

const erc20 = (from: string, to: string, amount: string, token = usdc) => ({
  type: 'transfer',
  standard: 'erc20',
  token,
  from,
  to,
  amount
})

describe('netBalanceChanges', () => {
  it('nets per asset so the user sees what leaves and arrives, not a transfer list', () => {
    const changes = netBalanceChanges({
      account: account.toUpperCase(),
      effects: [erc20(account, other, '1000000000')],
      nativeChange: '310000000000000000'
    })
    expect(changes).toEqual([
      { asset: 'native', standard: 'native', delta: '310000000000000000' },
      { asset: usdc, standard: 'erc20', delta: '-1000000000' }
    ])
  })

  it('drops a token that goes out and comes back', () => {
    expect(
      netBalanceChanges({
        account,
        effects: [erc20(account, other, '5'), erc20(other, account, '5')]
      })
    ).toEqual([])
  })

  it('counts ERC-721 mints and burns, and ERC-1155 amounts', () => {
    const changes = netBalanceChanges({
      account,
      effects: [
        { type: 'transfer', standard: 'erc721', token: nft, from: zero, to: account, tokenId: '1' },
        { type: 'transfer', standard: 'erc721', token: nft, from: zero, to: account, tokenId: '2' },
        { type: 'transfer', standard: 'erc721', token: nft, from: account, to: zero, tokenId: '9' },
        { type: 'transfer', standard: 'erc1155', token: other, from: account, to: other, amount: '4' }
      ]
    })
    expect(changes).toEqual([
      { asset: nft, standard: 'erc721', delta: '1' },
      { asset: other, standard: 'erc1155', delta: '-4' }
    ])
  })

  it('ignores transfers that do not involve the account and non-transfer effects', () => {
    expect(
      netBalanceChanges({
        account,
        effects: [erc20(other, nft, '7'), { type: 'approval', token: usdc, standard: 'erc20' }]
      })
    ).toEqual([])
  })

  it('uses fallbackNativeOut only when there is no native trace', () => {
    const base = { account, effects: [], fallbackNativeOut: '5' }
    expect(netBalanceChanges(base)).toEqual([{ asset: 'native', standard: 'native', delta: '-5' }])
    expect(netBalanceChanges({ ...base, nativeChange: '-7' })).toEqual([
      { asset: 'native', standard: 'native', delta: '-7' }
    ])
  })
})

describe('usdOf', () => {
  it('scales by decimals', () => {
    expect(usdOf('-1000000000', 6, 0.9999)).toBeCloseTo(-999.9)
  })
})

describe('summarizeBalancePreview', () => {
  const change = (usd?: number, standard: 'native' | 'erc20' | 'erc721' = 'erc20') => ({
    asset: usd === undefined ? 'x' : `a${usd}`,
    standard,
    delta: '1',
    usd
  })

  it('flags a swap that receives under 95% of what it sends', () => {
    const { swapLoss, totalUsd } = summarizeBalancePreview([change(-1000), change(940, 'native')])
    expect(swapLoss?.lossPct).toBeCloseTo(6)
    expect(totalUsd).toBeCloseTo(-60)
  })

  it('does not flag at 96%', () => {
    expect(summarizeBalancePreview([change(-1000), change(960)]).swapLoss).toBeUndefined()
  })

  it('suppresses the warning when any fungible change is unpriced, so an untrusted side cannot fake a loss', () => {
    const summary = summarizeBalancePreview([change(-1000), change(10), change(undefined)])
    expect(summary.swapLoss).toBeUndefined()
    expect(summary.unpricedFungible).toBe(1)
  })

  it('ignores NFTs and needs both a send and a receive', () => {
    expect(summarizeBalancePreview([change(-1000), change(undefined, 'erc721')]).swapLoss).toBeUndefined()
    expect(summarizeBalancePreview([change(-1000)]).swapLoss).toBeUndefined()
    expect(summarizeBalancePreview([change(undefined)]).totalUsd).toBeUndefined()
  })
})
