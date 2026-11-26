import React from 'react'

import link from '../../../resources/link'

const ZERO_PRIVILEGE = `0x${'0'.repeat(64)}`
const FAILED = 'Couldn’t prepare the key change. No request was sent.'

// Keys of an account delegated to Ambire. Main checks the delegation and builds every self-call.
export class AmbireKeys extends React.Component {
  state = { keys: undefined, input: '', busy: false, message: '' }

  componentDidMount() {
    this.mounted = true
    link.rpc('getAmbireKeys', this.props.account, this.props.chainId, (error, result) => {
      if (!this.mounted || error || !result?.supported) return
      const incomplete = result.discovery !== 'complete'
      this.setState({ keys: result.keys, incomplete })
      const active = result.keys.filter(({ privilege }) => privilege !== ZERO_PRIVILEGE).length
      this.props.onActiveKeys?.(active, incomplete)
    })
  }

  componentWillUnmount() {
    this.mounted = false
  }

  start() {
    if (this.state.busy) return false
    this.setState({ busy: true, message: '' })
    return true
  }

  openRequest = (error, reference) => {
    if (!this.mounted) return
    if (error || !reference?.handlerId) return this.setState({ busy: false, message: FAILED })
    this.setState({ busy: false, input: '' })
    link.send('tray:action', 'closeDash')
    link.send('nav:forward', 'panel', {
      view: 'requestView',
      data: { step: 'confirm', accountId: reference.account, requestId: reference.handlerId }
    })
  }

  changeKey(key, add) {
    if (!this.start()) return
    const { account, chainId } = this.props
    link.rpc('requestAmbireKeyChange', account, chainId, key, add, this.openRequest)
  }

  clearKeys() {
    if (!this.start()) return
    link.rpc('requestAmbireKeysClear', this.props.account, this.props.chainId, this.openRequest)
  }

  render() {
    const { keys, incomplete, input, busy, message } = this.state
    if (!keys) return null
    const candidate = input.trim()

    return (
      <div className='ambireKeys'>
        <span>Ambire account keys</span>
        <small>Keys on this network, from Saf0o and from the account’s on-chain history.</small>
        {incomplete ? (
          <p role='alert'>
            The configured RPC could not return the account’s full key history, so this list can miss keys.
            Revoking asks you to confirm first. For a full list, use an RPC that serves eth_getLogs over the
            full chain history.
          </p>
        ) : null}
        {keys.map(({ address, privilege, external }) => (
          <div key={address} className='ambireKeysRow'>
            <code title={address}>{address}</code>
            {external ? <small>Added outside Saf0o</small> : null}
            {privilege === ZERO_PRIVILEGE ? (
              <small>Inactive</small>
            ) : (
              <button
                type='button'
                className='saf0oControl'
                disabled={busy}
                onClick={() => this.changeKey(address, false)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div className='ambireKeysRow'>
          <input
            aria-label='Key address'
            className='saf0oInput'
            placeholder='0x…'
            value={input}
            disabled={busy}
            onChange={(event) => this.setState({ input: event.target.value })}
          />
          <button
            type='button'
            className='saf0oControl'
            disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(candidate)}
            onClick={() => this.changeKey(candidate, true)}
          >
            Add key
          </button>
        </div>
        {keys.some(({ privilege }) => privilege !== ZERO_PRIVILEGE) ? (
          <div className='ambireKeysRow'>
            <small>Clear the keys before you revoke. Ambire keys stay in the account after a revoke.</small>
            <button type='button' className='saf0oControl' disabled={busy} onClick={() => this.clearKeys()}>
              Clear all keys
            </button>
          </div>
        ) : null}
        {message ? <p role='status'>{message}</p> : null}
      </div>
    )
  }
}
