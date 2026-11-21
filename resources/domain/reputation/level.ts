export type ReputationLevel = 'danger' | 'trusted' | 'caution' | 'unknown'
export type LocalKind = 'contact' | 'account' | 'token'
export type Unavailable = 'no-key' | 'bad-key' | 'chain' | 'rate-limit' | 'blocked' | 'error'
export type Signal<T> = Readonly<{ ok: true; value: T } | { ok: false; reason: Unavailable }>
export type TargetSignals = Readonly<{
  local?: { kind: LocalKind; label?: string }
  creation?: Signal<{ isContract: false } | { isContract: true; createdAt: number }> // unix s
  source?: Signal<{ verified: boolean; name?: string; proxy: boolean }>
  usage?: Signal<{ txs: number; senders: number; spanDays: number; sampleFull: boolean }>
  yours?: Signal<{ count: number; scanned: number; complete: boolean }>
  label?: Signal<{ name?: string }>
  risk?: Signal<{ score: 0 | 1 | 2 | 3 | 4 | 5 }> // 0 = not scored
  knownToken?: boolean // scanned, not user-added: informational only
  lookalike: boolean
}>

const DANGER_LABEL = /exploit|phish|scam|hack|sanction|drainer|mixer|ransom/i
const WEEK_S = 7 * 86400
const FEW_SENDERS = 50

// Etherscan signals only lower the level: a verified name is attacker-chosen, so it never earns `trusted`.
export function reputationLevel(s: TargetSignals, now: number): ReputationLevel {
  const score = s.risk?.ok ? s.risk.value.score : undefined
  const labelName = s.label?.ok ? s.label.value.name : undefined

  if ((score !== undefined && score >= 4) || (labelName && DANGER_LABEL.test(labelName))) return 'danger'
  if (s.local || (labelName && score !== undefined && score >= 1 && score <= 2)) return 'trusted'

  const created = s.creation?.ok && s.creation.value.isContract ? s.creation.value.createdAt : undefined
  const isContract = s.creation?.ok ? s.creation.value.isContract : false
  const usage = s.usage?.ok ? s.usage.value : undefined
  if (
    score === 3 ||
    s.lookalike ||
    (created !== undefined && now / 1000 - created < WEEK_S) ||
    (isContract && s.source?.ok && !s.source.value.verified) ||
    usage?.txs === 0 ||
    (isContract && usage && usage.senders < FEW_SENDERS)
  ) {
    return 'caution'
  }
  return 'unknown'
}
