import { render, screen } from '@testing-library/react'

import AddressReputation from '../../../../resources/Components/AddressReputation'

const address = '0x1111111111111111111111111111111111111111'
const ok = (value) => ({ ok: true, value })
const no = (reason) => ({ ok: false, reason })
const reputation = (signals, level, state = 'done') => ({
  chainId: 1,
  assessedAt: 1_800_000_000_000,
  targets: [{ address, state, level, signals: { lookalike: false, ...signals } }]
})
const show = (rep) =>
  render(<AddressReputation address={address.toUpperCase().replace('0X', '0x')} reputation={rep} />)

describe('AddressReputation', () => {
  it('announces danger as an alert with the flag label and risk level', () => {
    show(reputation({ label: ok({ name: 'Lazarus Group' }), risk: ok({ score: 5 }) }, 'danger'))
    expect(screen.getByRole('alert').textContent).toBe('Flagged: Lazarus Group · Critical risk')
  })

  it('shows a caution chip with contract facts', () => {
    const age = 1_800_000_000 - 3 * 86400
    show(
      reputation(
        {
          creation: ok({ isContract: true, createdAt: age }),
          source: ok({ verified: false, proxy: true }),
          usage: ok({ txs: 200, senders: 12, spanDays: 4, sampleFull: true }),
          yours: ok({ count: 0, scanned: 1000, complete: false })
        },
        'caution'
      )
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Caution')
    expect(alert.textContent).toContain(
      'unverified · 3 d · 12 senders in last 200 txs · you: none in last 1000 · proxy'
    )
  })

  it('shows what you did with a trusted contact and your history count', () => {
    show(
      reputation(
        { local: { kind: 'contact', label: 'Bob' }, yours: ok({ count: 14, scanned: 30, complete: true }) },
        'trusted'
      )
    )
    expect(screen.getByText('Saved contact')).toBeTruthy()
    expect(screen.getByText('you: 14 txs')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says you never used a target when the whole history was scanned', () => {
    show(reputation({ yours: ok({ count: 0, scanned: 5, complete: true }) }, 'unknown'))
    expect(screen.getByText('you: never')).toBeTruthy()
  })

  it('quotes an attacker-chosen contract name and never styles it as trust', () => {
    show(reputation({ source: ok({ verified: true, name: 'UniswapRouter', proxy: false }) }, 'unknown'))
    expect(screen.getByText('named "UniswapRouter" · verified')).toBeTruthy()
    expect(document.querySelector('.addressReputationTrusted')).toBeNull()
  })

  it('renders nothing for unknown with no data, only no-key, or a missing target', () => {
    const { container, rerender } = show(reputation({}, 'unknown'))
    expect(container.firstChild).toBeNull()
    rerender(
      <AddressReputation
        address={address}
        reputation={reputation({ creation: no('no-key'), usage: no('no-key') }, 'unknown')}
      />
    )
    expect(container.firstChild).toBeNull()
    rerender(
      <AddressReputation
        address={`0x${'2'.repeat(40)}`}
        reputation={reputation({ creation: ok({ isContract: false }) }, 'unknown')}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows a polite pending line while checking', () => {
    show(reputation({}, 'unknown', 'pending'))
    const line = screen.getByText('Checking reputation…')
    expect(line.getAttribute('aria-live')).toBe('polite')
  })

  it('notes partial outages without hiding the signals that worked', () => {
    show(
      reputation(
        { usage: ok({ txs: 0, senders: 0, spanDays: 0, sampleFull: false }), source: no('rate-limit') },
        'caution'
      )
    )
    expect(screen.getByRole('alert').textContent).toContain('no transactions · reputation partly unavailable')
  })
})
