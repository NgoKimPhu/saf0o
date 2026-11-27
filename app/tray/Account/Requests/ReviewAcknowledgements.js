import TxApproval from '../../Footer/RequestCommand/TxApproval'

const ReviewAcknowledgements = ({ req, readOnly = false }) =>
  req.approvals?.length ? (
    <div className='signingReviewAcknowledgements'>
      {/* The account upgrade sits first, next to the upgrade notice above it; risk approvals follow. */}
      {[...req.approvals]
        .sort(
          (a, b) => Number(b.type === 'approveAccountUpgrade') - Number(a.type === 'approveAccountUpgrade')
        )
        .map((approval) => (
          <TxApproval
            key={`${req.account}:${req.handlerId}:${approval.type}:${approval.data?.consentFingerprint || JSON.stringify(approval.data)}:${approval.approved}`}
            req={req}
            approval={approval}
            inline
            readOnly={readOnly || req.status !== undefined || req.locked}
          />
        ))}
    </div>
  ) : null

export default ReviewAcknowledgements
