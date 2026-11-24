import { useEffect, useRef, useState } from 'react'

import link from '../../../../resources/link'

const KEY_FORMAT = /^[A-Za-z0-9_-]{16,128}$/u
const tokenId = (token) => `${token.chainId}:${token.address.toLowerCase()}`

// Raw integer balance to a short decimal string. Display only.
export const formatBalance = (raw, decimals) => {
  const digits = BigInt(raw)
    .toString()
    .padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals, digits.length - decimals + 6).replace(/0+$/u, '')
  if (whole === '0' && !fraction && BigInt(raw) > 0n) return '<0.000001'
  return fraction ? `${whole}.${fraction}` : whole
}

const MESSAGES = {
  'credential-unavailable': 'Secure storage is unavailable.',
  'discovery-failed': 'Alchemy did not answer. Check the API key and try again.',
  'invalid-request': 'Select an account first.',
  'key-missing': 'Save an Alchemy API key first.',
  'preview-expired': 'The list is out of date. Scan again.'
}

export default function ImportTokens({ account, chainName }) {
  const keyRef = useRef(null)
  const mountedRef = useRef(true)
  const [open, setOpen] = useState(false)
  const [credential, setCredential] = useState(null)
  const [keyReady, setKeyReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [message, setMessage] = useState('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open || credential) return
    link.invoke('tokenImport:credentialStatus').then((result) => {
      if (!mountedRef.current) return
      if (result?.success) setCredential(result.credential)
      else setMessage(MESSAGES['credential-unavailable'])
    })
  }, [open, credential])

  const run = async (action) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch {
      if (mountedRef.current) setMessage('Request failed.')
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  const saveKey = () =>
    run(async () => {
      const apiKey = keyRef.current.value
      keyRef.current.value = ''
      setKeyReady(false)
      const result = await link.invoke('tokenImport:saveCredential', apiKey)
      if (!mountedRef.current) return
      if (result?.success) setCredential(result.credential)
      else setMessage('API key could not be saved.')
    })

  const removeKey = () =>
    run(async () => {
      const result = await link.invoke('tokenImport:removeCredential')
      if (!mountedRef.current) return
      if (result?.success) {
        setCredential(result.credential)
        setPreview(null)
      } else setMessage('API key could not be removed.')
    })

  const scan = () =>
    run(async () => {
      const result = await link.invoke('tokenImport:preview', account)
      if (!mountedRef.current) return
      if (!result?.success) return setMessage(MESSAGES[result?.error] || 'Scan failed.')
      setPreview(result)
      setSelected(new Set())
    })

  const importSelected = () =>
    run(async () => {
      const tokens = preview.candidates
        .filter((token) => selected.has(tokenId(token)))
        .map(({ chainId, address }) => ({ chainId, address }))
      const result = await link.invoke('tokenImport:save', account, tokens)
      if (!mountedRef.current) return
      if (!result?.success) return setMessage(MESSAGES[result?.error] || 'Import failed.')
      setPreview(null)
      setMessage(`Imported ${result.saved} token${result.saved === 1 ? '' : 's'}.`)
    })

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  if (!open) {
    return (
      <div className='importTokens'>
        <button type='button' className='saf0oControl saf0oControlGhost' onClick={() => setOpen(true)}>
          Import from Alchemy
        </button>
        <div aria-live='polite'>{message}</div>
      </div>
    )
  }

  const names = (ids) => ids.map(chainName).join(', ')

  return (
    <div className='importTokens importTokensOpen'>
      <div className='importTokensTitle'>Import tokens from Alchemy</div>
      <div className='importTokensNote'>
        Looks up the selected account’s ERC-20 balances once. Nothing is added until you tick it. Tokens you
        did not expect are often scams. Your API key stays in this device’s secure storage.
      </div>
      {!credential ? null : !credential.available ? (
        <div>Secure storage unavailable. Cannot save an API key.</div>
      ) : (
        <div className='importTokensKey'>
          {credential.configured ? (
            <>
              <button type='button' className='saf0oControl' disabled={busy || !account} onClick={scan}>
                {busy ? 'Scanning…' : 'Scan account'}
              </button>
              <button
                type='button'
                className='saf0oControl saf0oControlGhost'
                disabled={busy}
                onClick={removeKey}
              >
                Remove key
              </button>
            </>
          ) : (
            <>
              <input
                ref={keyRef}
                type='password'
                className='saf0oInput'
                aria-label='Alchemy API key'
                autoComplete='off'
                spellCheck={false}
                maxLength='128'
                disabled={busy}
                placeholder='Alchemy API key'
                onInput={(event) => setKeyReady(KEY_FORMAT.test(event.currentTarget.value))}
              />
              <button
                type='button'
                className='saf0oControl saf0oControlGhost'
                disabled={busy || !keyReady}
                onClick={saveKey}
              >
                Save key
              </button>
            </>
          )}
        </div>
      )}
      {preview ? (
        <div className='importTokensResults'>
          {preview.candidates.length ? (
            <ul aria-label='Tokens found'>
              {preview.candidates.map((token) => {
                const id = tokenId(token)
                return (
                  <li key={id}>
                    <label>
                      <input type='checkbox' checked={selected.has(id)} onChange={() => toggle(id)} />
                      <span className='importTokensSymbol'>{token.symbol}</span>
                      <span>{token.name}</span>
                      <span>{chainName(token.chainId)}</span>
                      <span>{formatBalance(token.balance, token.decimals)}</span>
                      <span className='importTokensAddress'>{token.address}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div>No new tokens found.</div>
          )}
          {preview.truncated ? (
            <div>The list is incomplete: Alchemy returned more tokens than Saf0o loads.</div>
          ) : null}
          {preview.failedChainIds.length ? <div>No answer for: {names(preview.failedChainIds)}.</div> : null}
          {preview.skippedChainIds.length ? (
            <div>Not supported by Alchemy here: {names(preview.skippedChainIds)}.</div>
          ) : null}
          {selected.size ? (
            <button type='button' className='saf0oControl' disabled={busy} onClick={importSelected}>
              {`Import ${selected.size} selected`}
            </button>
          ) : null}
        </div>
      ) : null}
      <div aria-live='polite'>{message}</div>
    </div>
  )
}
