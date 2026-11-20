const Toggle = ({ checked, disabled = false, label, onChange, className = '' }) => {
  const classes = ['saf0oToggle', checked ? 'saf0oToggleOn' : '', className].filter(Boolean).join(' ')

  return (
    <button
      type='button'
      aria-checked={checked}
      aria-label={label}
      className={classes}
      disabled={disabled}
      role='switch'
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden='true' className='saf0oToggleThumb' />
    </button>
  )
}

export default Toggle
