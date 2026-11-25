import React from 'react'
import Restore from 'react-restore'
import link from '../../../../resources/link'
import { getPermissionIds } from '../../../../resources/domain/permissions'
import Icon from '../../../../resources/Components/Icon'
import ChainIdentityMark from '../../../../resources/Components/ChainIdentityMark'
import { safeNetworkMetadata } from '../../../../resources/domain/networkMetadata'

export class DappDetails extends React.Component {
  state = { switchingChainId: null, openingAccount: '', accessError: '', blockChoice: '' }

  componentDidMount() {
    this.mounted = true
  }

  componentWillUnmount() {
    this.mounted = false
    clearTimeout(this.switchTimer)
  }

  switchOriginChain(id, selected) {
    if (selected || this.switchPending) return
    const origin = this.store('main.origins', this.props.originId)
    const chain = this.store('main.networks.ethereum', id)
    if (!origin || !chain?.on || origin.chain?.id === id) return

    this.switchPending = true
    this.setState({ switchingChainId: id })
    link.send('tray:action', 'switchOriginChain', this.props.originId, id, 'ethereum')
    this.switchTimer = setTimeout(() => {
      this.switchPending = false
      if (this.mounted) this.setState({ switchingChainId: null })
    }, 500)
  }

  openAccountAccess(account) {
    if (this.openingAccess) return
    const permissions = this.store('main.permissions', account) || {}
    if (
      !getPermissionIds(permissions).some(
        (id) => permissions[id].handlerId === this.props.originId || id === this.props.originId
      )
    )
      return
    this.openingAccess = true
    this.setState({ openingAccount: account, accessError: '' })
    link.rpc('setSigner', account, (error) => {
      if (!this.mounted) return
      this.openingAccess = false
      if (error)
        return this.setState({ openingAccount: '', accessError: 'Could not open this account. Try again.' })
      link.send('nav:forward', 'panel', {
        view: 'expandedModule',
        data: { id: 'permissions', account, title: 'Apps with access' }
      })
      link.send('tray:action', 'closeDash')
      this.setState({ openingAccount: '' })
    })
  }

  renderBlocked(origin) {
    const { originId } = this.props
    const blockedApps = this.store('main.blockedApps') || {}
    const accounts = this.store('main.accounts') || {}
    const permissions = this.store('main.permissions') || {}
    const blocked = Object.keys(blockedApps).filter((account) => originId in blockedApps[account])
    const candidates = Object.keys(accounts).filter(
      (account) => !blocked.includes(account.toLowerCase()) && !(originId in (permissions[account] || {}))
    )
    const choice = candidates.includes(this.state.blockChoice) ? this.state.blockChoice : candidates[0]
    const accountName = (account) => this.store('main.accounts', account, 'name') || 'Account'

    return (
      <section className='originAccessContext originBlocked'>
        <div className='originSwapTitle'>Blocked</div>
        {blocked.map((account) => (
          <div className='originAccountAccess' key={account}>
            <span>{accountName(account)}</span>
            <code>{account}</code>
            <button
              type='button'
              className='saf0oControl saf0oControlGhost'
              aria-label={`Remove block for ${accountName(account)}`}
              onClick={() => link.send('tray:action', 'unblockApp', account, originId)}
            >
              Remove
            </button>
          </div>
        ))}
        {!blocked.length ? <p>No blocked accounts</p> : null}
        {candidates.length ? (
          <div className='originBlockAdd'>
            <select
              aria-label='Account to block'
              value={choice}
              onChange={(e) => this.setState({ blockChoice: e.target.value })}
            >
              {candidates.map((account) => (
                <option key={account} value={account}>
                  {accountName(account)}
                </option>
              ))}
            </select>
            <button
              type='button'
              className='saf0oControl saf0oControlGhost'
              onClick={() => link.send('tray:action', 'blockApp', choice, originId, origin.name)}
            >
              Block
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  updateOriginChain(origin) {
    return (
      <div className='originSwapChainList'>
        {Object.keys(this.store('main.networks.ethereum'))
          .filter((id) => {
            return this.store('main.networks.ethereum', id, 'on')
          })
          .map((id) => {
            const chain = this.store('main.networks.ethereum', id)
            const selected = origin.chain.id === parseInt(id)
            const { primaryColor, icon } = safeNetworkMetadata(
              this.store('main.networksMeta.ethereum', id),
              chain
            )
            return (
              <button
                type='button'
                aria-pressed={selected}
                key={id}
                className={'originChainItem'}
                disabled={selected || this.state.switchingChainId !== null}
                onClick={() => this.switchOriginChain(parseInt(id), selected)}
              >
                <div className='originChainItemIcon'>
                  <ChainIdentityMark
                    chainId={chain.id}
                    icon={icon}
                    isTestnet={chain.isTestnet}
                    primaryColor={primaryColor}
                  />
                </div>

                {chain.name}

                <div className='originChainItemCheck'>
                  {selected ? <Icon name='check' size={28} /> : null}
                </div>
              </button>
            )
          })}
      </div>
    )
  }

  render() {
    const origin = this.store('main.origins', this.props.originId)
    if (!origin) {
      return (
        <div className='connectedApps cardShow connectedAppMissing' role='status'>
          This connected app is no longer available.
        </div>
      )
    }

    return (
      <div className='connectedApps connectedAppsDetails cardShow'>
        <div className='originSwapOrigin'>
          <Icon name='apps' size={20} />
          <div className='originSwapOriginText'>{origin.name}</div>
        </div>
        <section className='originAccessContext'>
          <div className='originSwapTitle'>Account access</div>
          {Object.entries(this.store('main.permissions') || {})
            .filter(([, permissions]) =>
              getPermissionIds(permissions).some(
                (id) => permissions[id].handlerId === this.props.originId || id === this.props.originId
              )
            )
            .map(([account]) => (
              <button
                type='button'
                className='saf0oControl saf0oControlGhost originAccountAccess'
                key={account}
                disabled={Boolean(this.state.openingAccount)}
                onClick={() => this.openAccountAccess(account)}
              >
                <span>{this.store('main.accounts', account, 'name') || 'Account'}</span>
                <code>{account}</code>
                <span>{this.state.openingAccount === account ? 'Opening…' : 'Manage access'}</span>
              </button>
            ))}
          {!Object.values(this.store('main.permissions') || {}).some((permissions) =>
            getPermissionIds(permissions).some(
              (id) => permissions[id].handlerId === this.props.originId || id === this.props.originId
            )
          ) ? (
            <p>No active account access</p>
          ) : null}
        </section>
        {this.state.accessError ? <p role='alert'>{this.state.accessError}</p> : null}
        {this.renderBlocked(origin)}
        <div className='originSwapTitle'>Default network</div>
        <div>{this.updateOriginChain(origin)}</div>
      </div>
    )
  }
}

export default Restore.connect(DappDetails)
