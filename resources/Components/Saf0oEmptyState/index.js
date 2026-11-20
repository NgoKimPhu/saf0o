const Saf0oEmptyState = ({ image, title, copy, expanded = false, transparentImage = false }) => (
  <div
    className={`saf0oEmptyState${expanded ? ' saf0oEmptyStateExpanded' : ''}${
      transparentImage ? ' saf0oEmptyStateTransparent' : ''
    }`}
  >
    <img
      className={`saf0oEmptyStateImage${transparentImage ? ' saf0oEmptyStateImageTransparent' : ''}`}
      src={image}
      alt=''
      aria-hidden='true'
    />
    <div className='saf0oEmptyStateText'>
      <div className='saf0oEmptyStateTitle'>{title}</div>
      {copy ? <div className='saf0oEmptyStateCopy'>{copy}</div> : null}
    </div>
  </div>
)

export default Saf0oEmptyState
