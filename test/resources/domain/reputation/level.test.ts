import { reputationLevel, type TargetSignals } from '../../../../resources/domain/reputation/level'

const now = 1_800_000_000_000
const nowS = now / 1000
const ok = <T>(value: T) => ({ ok: true as const, value })
const risk = (score: 0 | 1 | 2 | 3 | 4 | 5) => ({ risk: ok({ score }) })
const label = (name?: string) => ({ label: ok({ name }) })
const contract = (ageDays: number) => ({
  creation: ok({ isContract: true as const, createdAt: nowS - ageDays * 86400 })
})
const level = (s: Partial<TargetSignals>) => reputationLevel({ lookalike: false, ...s }, now)

describe('reputationLevel', () => {
  it('flags high and critical risk as danger, medium as caution', () => {
    expect(level(risk(4))).toBe('danger')
    expect(level(risk(5))).toBe('danger')
    expect(level(risk(3))).toBe('caution')
  })

  it('trusts a named label only when the risk-score call confirms low risk', () => {
    expect(level({ ...label('Uniswap'), ...risk(2) })).toBe('trusted')
    // the label call reports risk 0 even for Lazarus, so a failed risk call must not trust the label
    expect(level({ ...label('Uniswap'), risk: { ok: false, reason: 'error' } })).toBe('unknown')
    expect(level({ ...label('Uniswap'), ...risk(0) })).toBe('unknown')
    expect(level({ ...label(undefined), ...risk(1) })).toBe('unknown')
  })

  it('flags dangerous label text and lets danger beat a local hit', () => {
    expect(level({ ...label('Fake_Phishing 12') })).toBe('danger')
    expect(level({ local: { kind: 'contact', label: 'Bob' }, ...risk(5) })).toBe('danger')
  })

  it('trusts local hits even when the contract is new or unverified', () => {
    expect(
      level({
        local: { kind: 'token' },
        ...contract(1),
        source: ok({ verified: false, proxy: false })
      })
    ).toBe('trusted')
  })

  it('cautions on new contracts, unverified contracts, unused addresses and lookalikes', () => {
    expect(level(contract(3))).toBe('caution')
    expect(level({ ...contract(900), source: ok({ verified: false, proxy: false }) })).toBe('caution')
    expect(
      level({
        creation: ok({ isContract: false }),
        usage: ok({ txs: 0, senders: 0, spanDays: 0, sampleFull: false })
      })
    ).toBe('caution')
    expect(level({ lookalike: true })).toBe('caution')
  })

  it('never trusts remote Etherscan signals alone', () => {
    // anyone can verify a contract under any name
    expect(
      level({
        ...contract(900),
        source: ok({ verified: true, name: 'UniswapRouter', proxy: false }),
        usage: ok({ txs: 200, senders: 120, spanDays: 30, sampleFull: true })
      })
    ).toBe('unknown')
  })

  it('stays unknown when every signal is unavailable', () => {
    const no = { ok: false as const, reason: 'no-key' as const }
    expect(level({ creation: no, source: no, usage: no, yours: no, label: no, risk: no })).toBe('unknown')
  })
})
