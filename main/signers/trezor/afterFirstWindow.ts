import { app } from 'electron'

// Run fn once, after the first window has painted. The timer is a fallback in case no window appears.
export default function afterFirstWindow(fn: () => void, fallbackMs = 10_000) {
  let done = false
  const run = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    setImmediate(fn)
  }
  const timer = setTimeout(run, fallbackMs)
  app.once('browser-window-created', (_event, win) => win.once('ready-to-show', run))
}
