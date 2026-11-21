import fs from 'fs'
import stylus from 'stylus'

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
