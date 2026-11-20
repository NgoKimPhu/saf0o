import React from 'react'
import Restore from 'react-restore'
import DialogSurface from '../../../resources/Components/DialogSurface'
import link from '../../../resources/link'

export class Bridge extends React.Component {
  constructor(props, context) {
    super(props, context)
    this.primaryRef = React.createRef()
  }

  badge() {
    return this.store('view.badge') || {}
  }

  dismiss(badge) {
    if (badge.type === 'updateAvailable') {
      link.send('tray:dismissUpdate', badge.version, true)
    } else {
      link.send('tray:action', 'updateBadge', '')
    }
  }

  render() {
    const badge = this.badge()
    const available = badge.type === 'updateAvailable'
    const ready = badge.type === 'updateReady'
    if (!available && !ready) return null

    const versionSubject = badge.version ? `Saf0o ${badge.version}` : 'The Saf0o update'
    const heading = available ? 'Update available' : 'Update ready'
    const body = versionSubject

    return (
      <div className='badgeWrap'>
        <DialogSurface
          as='section'
          className='updateDialog cardShow'
          describedBy='saf0o-update-body'
          initialFocusRef={this.primaryRef}
          key={`${badge.type}:${badge.version || ''}`}
          labelledBy='saf0o-update-heading'
          modal
          onCancel={() => this.dismiss(badge)}
        >
          <div className='updateDialogCopy'>
            <span className='updateDialogEyebrow'>Saf0o desktop</span>
            <h2 id='saf0o-update-heading'>{heading}</h2>
            <p id='saf0o-update-body'>{body}</p>
          </div>
          <div className='updateDialogActions'>
            <button
              className='saf0oControl saf0oControlPrimary saf0oControlLarge saf0oHeroPrimary'
              onClick={() =>
                available ? link.send('tray:installAvailableUpdate') : link.send('tray:updateRestart')
              }
              ref={this.primaryRef}
              type='button'
            >
              {available ? 'Get update' : 'Restart and install'}
            </button>
            <button
              className='saf0oControl saf0oControlSecondary saf0oControlLarge'
              onClick={() => this.dismiss(badge)}
              type='button'
            >
              Later
            </button>
          </div>
          {available ? (
            <button
              className='updateDialogSkip saf0oControl saf0oControlGhost saf0oControlCompact'
              onClick={() => link.send('tray:dismissUpdate', badge.version, false)}
              type='button'
            >
              Skip this version
            </button>
          ) : null}
        </DialogSurface>
      </div>
    )
  }
}

export default Restore.connect(Bridge)
