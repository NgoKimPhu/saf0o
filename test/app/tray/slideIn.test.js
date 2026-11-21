import fs from 'fs'
import stylus from 'stylus'
import { TRAY_SLIDE_OUT_MS } from '../../../main/windows/displayTransition'

// Windows shows the hidden window's last frame on reopen. If the panel sat at its final spot
// while hidden, that frame flickers before the slide-in starts; parking it at the slide's start
// leaves the frame empty.
const file = 'app/tray/index.styl'
const view = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()

it.each([
  ['right', '100%'],
  ['left', '-100%']
])('parks the %s-docked panel off-screen while suspended', (edge, offset) => {
  const rule = new RegExp(
    `\\.workspace-edge-${edge}\\.suspend #panel,\\s*\\.workspace-edge-${edge}\\.suspend::before \\{[^}]*transform: translateX\\(${offset}\\);`
  )
  expect(view).toMatch(rule)
})

// Hiding slides the panel out to its parked spot; main waits TRAY_SLIDE_OUT_MS before it hides
// the window, so the slide must fit inside that wait.
it.each(['right', 'left'])('slides the %s-docked panel out in 40ms when it parks', (edge) => {
  const rule = new RegExp(
    `\\.workspace-edge-${edge}\\.suspend #panel,\\s*\\.workspace-edge-${edge}\\.suspend::before \\{[^}]*transition: transform 40ms ease-in;`
  )
  expect(view).toMatch(rule)
  expect(TRAY_SLIDE_OUT_MS).toBeGreaterThan(40)
})
