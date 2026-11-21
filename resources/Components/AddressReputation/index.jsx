const RISK_TEXT = { 3: 'Medium risk', 4: 'High risk', 5: 'Critical risk' }
const LOCAL_TEXT = { contact: 'Saved contact', account: 'Saf0o account', token: 'Custom token' }
const SIGNALS = ['creation', 'source', 'usage', 'yours', 'label', 'risk']

const okValue = (signal) => (signal?.ok ? signal.value : undefined)

const ageText = (reputation, creation) => {
  if (!creation?.isContract) return
  const days = Math.max(0, Math.floor((reputation.assessedAt / 1000 - creation.createdAt) / 86400))
  return days >= 365 ? `${Math.floor(days / 365)} y` : `${days} d`
}

const yoursText = (yours) => {
  if (!yours) return
  if (yours.count > 0) return `you: ${yours.count} tx${yours.count === 1 ? '' : 's'}`
  return yours.complete ? 'you: never' : `you: none in last ${yours.scanned}`
}

const AddressReputation = ({ address, reputation }) => {
  const target =
    typeof address === 'string'
      ? reputation?.targets?.find((t) => t.address === address.toLowerCase())
      : undefined
  if (!target) return null
  if (target.state === 'pending') {
    return (
      <div className='addressReputation addressReputationPending' aria-live='polite'>
        Checking reputation…
      </div>
    )
  }

  const { signals, level } = target
  const present = SIGNALS.filter((name) => signals[name])
  const hasOk = present.some((name) => signals[name].ok)
  const partlyUnavailable = present.some((name) => !signals[name].ok && signals[name].reason !== 'no-key')
  if (!signals.local && !hasOk && !partlyUnavailable) return null

  const label = okValue(signals.label)?.name
  const score = okValue(signals.risk)?.score
  const riskText = RISK_TEXT[score]
  const creation = okValue(signals.creation)
  const source = okValue(signals.source)
  const usage = okValue(signals.usage)

  let chip
  if (level === 'danger')
    chip = [label ? `Flagged: ${label}` : 'Flagged', riskText].filter(Boolean).join(' · ')
  else if (level === 'trusted') chip = signals.local ? LOCAL_TEXT[signals.local.kind] : label
  else if (level === 'caution') chip = ['Caution', riskText].filter(Boolean).join(' · ')

  // Remote names are attacker-chosen: always quoted, never styled as a trust signal.
  const facts = [
    level === 'caution' || level === 'unknown' ? label && `labeled "${label}"` : undefined,
    source?.name && `named "${source.name}"`,
    source && (source.verified ? 'verified' : 'unverified'),
    ageText(reputation, creation),
    usage && (usage.txs === 0 ? 'no transactions' : `${usage.senders} senders in last ${usage.txs} txs`),
    yoursText(okValue(signals.yours)),
    signals.knownToken ? 'scanned token' : undefined,
    source?.proxy ? 'proxy' : undefined,
    partlyUnavailable ? 'reputation partly unavailable' : undefined
  ].filter(Boolean)
  if (!chip && !facts.length) return null

  return (
    <div
      className={`addressReputation addressReputation${level[0].toUpperCase()}${level.slice(1)}`}
      role={level === 'danger' || level === 'caution' ? 'alert' : undefined}
    >
      {chip ? <strong className='addressReputationChip'>{chip}</strong> : null}
      {facts.length ? <span className='addressReputationFacts'>{facts.join(' · ')}</span> : null}
    </div>
  )
}

export default AddressReputation
