import React from 'react'
import Restore from 'react-restore'
import saf0oMark from 'url:../../../asset/brand/exports/app/saf0o-app-icon-64.png'
import AccountTypeMark from '../../../resources/Components/AccountTypeMark'
import Icon from '../../../resources/Components/Icon'
import link from '../../../resources/link'
import { requestDashNavigation } from '../navigationGuard'

export class Command extends React.Component {
  renderSectionChrome(title, back = false) {
    return (
      <div className='command commandHome'>
        {back ? (
          <button
            type='button'
            aria-label='Back'
            className='commandHomeClose saf0oControl saf0oControlGhost saf0oControlIcon saf0oShellNav'
            onClick={() => {
              requestDashNavigation('back', () => link.send('tray:action', 'backDash'))
            }}
          >
            <Icon name='back' size={18} />
          </button>
        ) : null}
        <img className='commandHomeMark' src={saf0oMark} alt='' aria-hidden='true' />
        <span className='commandHomeIdentity'>
          <strong>{title}</strong>
        </span>
        <span className='commandHomeSpacer' />
        <button
          type='button'
          aria-label='Close'
          className='commandHomeClose saf0oControl saf0oControlGhost saf0oControlIcon saf0oShellNav'
          onClick={() => {
            requestDashNavigation('close', () => link.send('tray:action', 'closeDash'))
          }}
        >
          <Icon name='close' size={18} />
        </button>
      </div>
    )
  }

  renderSignerIcon(type) {
    if (['ledger', 'trezor', 'lattice'].includes(type)) {
      return (
        <div className='expandedSignerIcon'>
          <AccountTypeMark type={type} size={20} />
        </div>
      )
    } else if (type === 'seed' || type === 'ring') {
      return (
        <div className='expandedSignerIcon'>
          <Icon name='hot' size={23} />
        </div>
      )
    } else {
      return (
        <div className='expandedSignerIcon'>
          <Icon name='hardware' size={20} />
        </div>
      )
    }
  }
  renderSignerTitle() {
    const { data = {} } = this.store('windows.dash.nav')[0] || { view: '', data: {} }
    const signer = data.signer ? this.store('main.signers', data.signer) : {}
    if (!signer) return null
    return (
      <div className='expandedSignerTitle'>
        {/* <div className='signerType' style={this.props.inSetup ? {top: '21px'} : {top: '24px'}}>{this.props.model}</div> */}
        {this.renderSignerIcon(signer.type)}
        <div className='signerName'>{signer.name}</div>
      </div>
    )
  }
  render() {
    const nav = this.store('windows.dash.nav') || []
    const { data = {}, view } = nav[0] || { view: '', data: {} }
    const titles = {
      accounts: 'Accounts',
      addressBook: 'Contacts',
      chains: 'Networks',
      contracts: 'Contracts',
      contractVerification: 'Contracts',
      dapps: 'Connected apps',
      deployment: 'Contracts',
      notify: 'Notice',
      default: 'Saf0o',
      settings: 'Settings',
      send: 'Send',
      tokens: 'Tokens'
    }
    const title = data.title || titles[view || 'default'] || view
    if (!nav.length) return this.renderSectionChrome('Control')
    if (view === 'accounts' && Object.keys(data).length === 0)
      return this.renderSectionChrome('Accounts', true)
    if (view === 'chains' && Object.keys(data).length === 0) return this.renderSectionChrome('Networks', true)
    if (view === 'settings' && Object.keys(data).length === 0)
      return this.renderSectionChrome('Settings', true)
    if (view === 'dapps' && Object.keys(data).length === 0)
      return this.renderSectionChrome('Connected apps', true)
    return (
      <div className='command'>
        {nav.length ? (
          <button
            type='button'
            aria-label='Back'
            className='commandItem commandItemBack cardShow saf0oControl saf0oControlSecondary saf0oControlIcon saf0oShellNav'
            onClick={() => {
              requestDashNavigation('back', () => link.send('tray:action', 'backDash'))
            }}
          >
            <Icon name='back' size={19} />
          </button>
        ) : null}
        <div key={view} className='commandTitle cardShow'>
          {view === 'expandedSigner' ? this.renderSignerTitle() : title}
        </div>
        <button
          type='button'
          aria-label='Close'
          className='commandItem commandItemClose saf0oControl saf0oControlSecondary saf0oControlIcon saf0oShellNav'
          onClick={() => {
            requestDashNavigation('close', () => link.send('tray:action', 'closeDash'))
          }}
        >
          <Icon name='close' size={19} />
        </button>
      </div>
    )
  }
}

export default Restore.connect(Command)
