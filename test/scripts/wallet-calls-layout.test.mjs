import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import stylus from 'stylus'

const root = path.resolve(import.meta.dirname, '../..')

// A batch call row has one child, the call body. A leftover two-column grid put that body in a
// 28px track, so every label and address wrapped a few characters per line.
test('every .walletCall grid rule uses a single full-width column', () => {
  const file = path.join(root, 'app/tray/Account/Requests/style/index.styl')
  const css = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()
  const tracks = [...css.matchAll(/\.walletCall\b[^{}]*\{[^}]*grid-template-columns:\s*([^;]*);/g)].map((m) =>
    m[1].trim()
  )
  assert.ok(tracks.length > 0, 'no .walletCall grid rule found')
  for (const t of tracks) assert.equal(t, 'minmax(0, 1fr)')
})

// `.walletCallsDestination span` sets display:block; the badge rule must outrank it to stay inline with the label.
test('the call-number badge stays inline beside the call label', () => {
  const file = path.join(root, 'app/tray/Account/Requests/style/index.styl')
  const css = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()
  assert.match(css, /\.walletCallsDestination \.walletCallsCallNumber\s*\{[^}]*display:\s*inline-flex/)
})
