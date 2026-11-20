import { useEffect, useRef, useState } from 'react'

import link from '../../../../resources/link'

const shortId = (fingerprint) => `${fingerprint.slice(0, 8)}…${fingerprint.slice(-6)}`

const NativeConnectNotification = ({ fingerprint, pairingCode, requestId, onClose }) => {
  const [copied, setCopied] = useState(false)
  const [responding, setResponding] = useState(false)
  const [responseError, setResponseError] = useState(false)
  const responsePendingRef = useRef(false)
  const lastResponseRef = useRef(true)
  const errorCancelRef = useRef()
  const copyTimerRef = useRef()

  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  useEffect(() => {
    if (responseError) errorCancelRef.current?.focus()
  }, [responseError])

  const respond = (accepted) => {
    if (responsePendingRef.current) return
    responsePendingRef.current = true
    lastResponseRef.current = accepted
    setResponding(true)
    link.rpc('respondToNativePeerRequest', requestId, accepted, (error) => {
      responsePendingRef.current = false
      if (error) {
        setResponding(false)
        setResponseError(true)
      } else {
        onClose()
      }
    })
  }

  const copyConnectionId = () => {
    link.send('tray:clipboardData', fingerprint)
    setCopied(true)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  if (responseError) {
    return (
      <div className='notifyBoxWrap' onMouseDown={(event) => event.stopPropagation()}>
        <div className='notifyBoxSlide'>
          <div className='notifyBox extensionConnectBox'>
            <h2 id='saf0o-notify-title' className='notifyTitle'>
              Could not connect to the local app
            </h2>
            <div className='notifyBody'>Saf0o could not complete this local pairing.</div>
            <div className='notifyInput'>
              <button
                ref={errorCancelRef}
                type='button'
                className='notifyInputOption notifyInputDeny saf0oControl saf0oControlSecondary'
                data-dialog-initial-focus
                disabled={responding}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type='button'
                className='notifyInputOption notifyInputProceed saf0oControl saf0oControlPrimary'
                disabled={responding}
                onClick={() => respond(lastResponseRef.current)}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='notifyBoxWrap' onMouseDown={(event) => event.stopPropagation()}>
      <div className='notifyBoxSlide'>
        <div className='notifyBox extensionConnectBox'>
          <h2 id='saf0o-notify-title' className='notifyTitle'>
            Allow local app to connect?
          </h2>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>Compare with the code in your local app.</div>
            <div className='extensionPairingCode'>{pairingCode}</div>
            <button
              type='button'
              className='extensionOriginButton nativeConnectTarget saf0oControl saf0oControlSecondary'
              aria-label='Copy full connection ID'
              onClick={copyConnectionId}
            >
              {copied ? 'Connection ID copied' : `Connection ID ${shortId(fingerprint)}`}
            </button>
            <div className='clusterStatus' role='status'>
              {copied ? 'Connection ID copied' : ''}
            </div>
          </div>
          <div className='notifyInput'>
            <button
              type='button'
              className='notifyInputOption nativeConnectTarget notifyInputDeny saf0oControl saf0oControlSecondary'
              aria-label='Not now'
              data-dialog-initial-focus
              disabled={responding}
              onClick={() => respond(false)}
            >
              Not now
            </button>
            <button
              type='button'
              className='notifyInputOption nativeConnectTarget notifyInputProceed saf0oControl saf0oControlPrimary'
              aria-label='Codes match, connect'
              disabled={responding}
              onClick={() => respond(true)}
            >
              Codes match, connect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NativeConnectNotification
