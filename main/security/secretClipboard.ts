import crypto from 'crypto'

export const SECRET_CLIPBOARD_TTL_MS = 60_000

type ClipboardAccess = {
  clear: () => void
  readText: () => string | Promise<string>
  writeText: (value: string) => void | Promise<void>
}

type TimerHandle = ReturnType<typeof setTimeout>

export function createSecretClipboard(
  clipboard: ClipboardAccess,
  {
    ttlMs = SECRET_CLIPBOARD_TTL_MS,
    schedule = setTimeout,
    cancelScheduled = clearTimeout,
    onError = () => {}
  }: {
    ttlMs?: number
    schedule?: (callback: () => void, delay: number) => TimerHandle
    cancelScheduled?: (timer: TimerHandle) => void
    onError?: (error: unknown) => void
  } = {}
) {
  let timer: TimerHandle | undefined
  let pendingFingerprint: Buffer | undefined

  const fingerprint = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest()

  const clearIfUnchanged = () => {
    const expected = pendingFingerprint
    pendingFingerprint = undefined
    if (!expected) return
    // Electron 45 made clipboard.readText/writeText async; plain strings stay supported.
    const clearIfMatches = (text: string) => {
      if (crypto.timingSafeEqual(fingerprint(text), expected)) clipboard.clear()
    }
    try {
      const text = clipboard.readText()
      if (typeof text === 'string') clearIfMatches(text)
      else text.then(clearIfMatches).catch(onError)
    } catch (error) {
      onError(error)
    }
  }

  const write = (value: string) => {
    const written = clipboard.writeText(value)
    if (written) written.catch(onError)
  }

  const cancel = () => {
    if (timer !== undefined) cancelScheduled(timer)
    timer = undefined
    pendingFingerprint = undefined
  }

  const writePublic = (value: string) => {
    write(value)
    cancel()
  }

  const writeSecret = (secret: string) => {
    const secretFingerprint = fingerprint(secret)
    write(secret)
    cancel()
    pendingFingerprint = secretFingerprint
    try {
      timer = schedule(() => {
        timer = undefined
        clearIfUnchanged()
      }, ttlMs)
      const scheduledTimer = timer as TimerHandle & { unref?: () => void }
      scheduledTimer.unref?.()
    } catch (error) {
      clearIfUnchanged()
      onError(error)
    }
  }

  const dispose = () => {
    if (timer !== undefined) cancelScheduled(timer)
    timer = undefined
    clearIfUnchanged()
  }

  return { cancel, dispose, writePublic, writeSecret }
}
