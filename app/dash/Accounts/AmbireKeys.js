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
      if (this.mounted && !error && result?.supported) this.setState({ keys: result.keys })
    })
  }

  componentWillUnmount() {
    this.mounted = false
  }

  changeKey(key, add) {
    if (this.state.busy) return
    this.setState({ busy: true, message: '' })
    link.rpc(
      'requestAmbireKeyChange',
      this.props.account,
      this.props.chainId,
      key,
      add,
      (error, reference) => {
        if (!this.mounted) return
        if (error || !reference?.handlerId) return this.setState({ busy: false, message: FAILED })
        this.setState({ busy: false, input: '' })
        link.send('tray:action', 'closeDash')
        link.send('nav:forward', 'panel', {
          view: 'requestView',
          data: { step: 'confirm', accountId: reference.account, requestId: reference.handlerId }
        })
      }
    )
  }

  render() {
    const { keys, input, busy, message } = this.state
    if (!keys) return null
    const candidate = input.trim()

    return (
      <div className='ambireKeys'>
        <span>Ambire account keys</span>
        <small>Keys added in Saf0o on this network. Keys added by other wallets are not listed.</small>
        {keys.map(({ address, privilege }) => (
          <div key={address} className='ambireKeysRow'>
            <code title={address}>{address}</code>
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
        {message ? <p role='status'>{message}</p> : null}
      </div>
    )
  }
}
