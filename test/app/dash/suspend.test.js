import fs from 'fs'
import stylus from 'stylus'

// Windows reshows a hidden view's last frame on reopen. The sidebar is its own view, so the tray
// panel's park does not reach it: unparked, the stale sidebar flashed before the slide-in.
const file = 'app/dash/index.styl'
const view = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()

it.each([
  ['right', '100%'],
  ['left', '-100%']
])('parks the %s-docked sidebar off-screen while the wallet is hidden', (edge, offset) => {
  expect(view).toMatch(
    new RegExp(`\\.workspace-edge-${edge}\\.suspend \\.dash \\{[^}]*transform: translateX\\(${offset}\\);`)
  )
})

it('marks the sidebar suspended whenever the tray is closed', () => {
  const source = fs.readFileSync('app/dash/index.js', 'utf8')
  expect(source).toMatch(/classList\.toggle\('suspend', !store\('tray\.open'\)\)/)
})

// Opening: the sidebar slides in with its content as the shell widens, not after a blank slide.
it.each(['right', 'left'])('slides the %s-docked sidebar in with its content on open', (edge) => {
  expect(view).toMatch(
    new RegExp(`\\.workspace-edge-${edge}\\.workspace-content-sliding #dash \\{[^}]*animation: dashSlideIn`)
  )
  expect(fs.readFileSync('app/dash/index.js', 'utf8')).toMatch(
    /classList\.add\('workspace-content-sliding'\)/
  )
})
