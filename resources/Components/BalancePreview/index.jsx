import { DisplayValue } from '../DisplayValue'
import { summarizeBalancePreview } from '../../domain/transaction/balanceChanges'

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const signed = (value) => `${value < 0 ? '−' : '+'}${usdFormat.format(Math.abs(value))}`
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`

const Usd = ({ value }) =>
  value === undefined ? (
    <span className='balancePreviewNoPrice'>no price</span>
  ) : (
    <span className='balancePreviewUsd'>{signed(value)}</span>
  )

const Change = ({ change, token, symbol }) => {
  const outgoing = change.delta.startsWith('-')
  const amount = change.delta.replace(/^-/, '')
  const native = change.standard === 'native'
  const nft = change.standard === 'erc721' || change.standard === 'erc1155'
  const label = native ? symbol : token?.symbol || shortAddress(change.asset)

  return (
    <div
      className={`transactionReviewAssetChange transactionReviewAssetChange${outgoing ? 'Outgoing' : 'Incoming'}`}
    >
      <span className='transactionReviewAssetChangeIdentity'>
        <strong title={native ? undefined : change.asset}>
          <span className='transactionReviewScreenReaderOnly'>{outgoing ? 'You send ' : 'You receive '}</span>
          {nft ? shortAddress(change.asset) : label}
        </strong>
        {!native && !nft && token && !token.known && (
          <span className='balancePreviewUnknown'>{shortAddress(change.asset)}</span>
        )}
      </span>
      <span className='transactionReviewAssetChangeAmount'>
        <span aria-hidden='true'>{outgoing ? '−' : '+'}</span>
        {nft ? (
          <span>{`${amount} ${amount === '1' ? 'item' : 'items'}`}</span>
        ) : native || token?.decimals !== undefined ? (
          <DisplayValue
            type='ether'
            value={amount}
            valueDataParams={{ decimals: native ? 18 : token.decimals }}
            currencySymbol={label}
            currencySymbolPosition='last'
          />
        ) : (
          <span>{`${amount} base units`}</span>
        )}
        {!nft && <Usd value={change.usd} />}
      </span>
    </div>
  )
}

// Net per-asset changes from the simulation. Informational only; it never gates signing.
// compact: the rows only, for one call inside a batch whose full preview sits above.
const BalancePreview = ({ preview, symbol, compact = false }) => {
  const { totalUsd, swapLoss } = summarizeBalancePreview(preview.changes)
  const changes = [...preview.changes].sort(
    (a, b) => Number(!a.delta.startsWith('-')) - Number(!b.delta.startsWith('-'))
  )

  return (
    <div
      className='transactionReviewAssetChangesInner balancePreview'
      role='group'
      aria-label={compact ? 'Call balance changes' : 'Net balance changes'}
    >
      {!compact && (
        <div className='transactionReviewAssetChangesHeader'>
          <strong>Estimated changes</strong>
        </div>
      )}
      {changes.map((change) => (
        <Change key={change.asset} change={change} token={preview.tokens[change.asset]} symbol={symbol} />
      ))}
      {compact
        ? null
        : totalUsd !== undefined && (
            <div className='balancePreviewTotal'>
              <span>Total</span>
              <Usd value={totalUsd} />
            </div>
          )}
      {!compact && preview.nativeNote && (
        <div className='balancePreviewFooter balancePreviewNativeNote' role='note'>
          {`${symbol} changes not shown: ${preview.nativeNote}`}
        </div>
      )}
      {!compact && swapLoss && (
        <div className='balancePreviewLoss' role='alert'>
          {`Receives about ${Math.round(swapLoss.lossPct)}% less than it sends (USD, trusted prices)`}
        </div>
      )}
      {!compact && preview.changes.some((change) => change.usd !== undefined) && (
        <div className='balancePreviewFooter'>Prices: DefiLlama, confidence ≥ 0.9; may be wrong</div>
      )}
    </div>
  )
}

export default BalancePreview
