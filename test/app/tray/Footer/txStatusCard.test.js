import fs from 'fs'
import stylus from 'stylus'

// At panel widths up to 610px the progress steps stack under the summary and the four facts wrap
// to two rows. A fixed 114px card with 44px/18px rows then draws them over each other (the
// confirmed card overlapped its steps and facts at 425px). The card must size to its content.
const file = 'app/tray/Account/Requests/style/saf0o-signing.styl'
const view = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()
const narrow = view.slice(view.indexOf('@container panel (max-width: 610px)'))
const narrowBlock = narrow.slice(0, narrow.indexOf('\n}\n'))

it('lets the narrow status card grow to fit stacked steps and wrapped facts', () => {
  expect(narrowBlock).toMatch(/\.requestNoticeTransactionStatus \{[^}]*height: auto;/)
  expect(narrowBlock).toMatch(
    /\.requestNoticeTransactionStatus \.requestNoticeInner \{[^}]*grid-template-rows: none;/
  )
})

it('does not pin a second fact to column 4 of the two-column narrow grid', () => {
  expect(narrowBlock).toMatch(/\.txLifecycleFacts > div:nth-child\(2\):last-child \{[^}]*grid-column: auto;/)
})

// Submit, confirm and the facts that arrive with the hash must not move the card or its steps.
// The card is as tall as its fullest state (confirmed, two facts rows) and anchored to the top.
// The steps keep one width because the action buttons beside them change per state.
it('keeps one card height, top anchor and steps width across submit to confirmed', () => {
  expect(narrowBlock).toMatch(/\.requestNoticeTransactionStatus \{[^}]*min-height: 126px;/)
  expect(narrowBlock).toMatch(/\.requestNoticeTransactionStatus \{[^}]*align-items: flex-start;/)
  expect(narrowBlock).toMatch(/\.txLifecycleSteps \{[^}]*width: 140px;/)
})
