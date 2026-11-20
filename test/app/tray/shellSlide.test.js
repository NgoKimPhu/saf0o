import fs from 'fs'
import path from 'path'
import stylus from 'stylus'

const file = path.resolve('app/tray/index.styl')
// Whitespace collapsed so rules can be matched as one string.
const flat = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render().replace(/\s+/g, ' ')

const rule = (selector) => {
  const start = flat.indexOf(selector + ' {')
  return start < 0 ? undefined : flat.slice(start, flat.indexOf('}', start))
}

it('slides the panel and its canvas in from the docked edge, ease-out, 150-200ms', () => {
  const right = rule(
    '.workspace-edge-right:not(.suspend) #panel, .workspace-edge-right:not(.suspend)::before'
  )
  expect(right).toMatch(/animation: shellSlideInRight 180ms ease-out 40ms backwards/)
  expect(flat).toMatch(/@keyframes shellSlideInRight \{ from \{ transform: translateX\(100%\)/)

  const left = rule('.workspace-edge-left:not(.suspend) #panel, .workspace-edge-left:not(.suspend)::before')
  expect(left).toMatch(/animation: shellSlideInLeft 180ms ease-out 40ms backwards/)
  expect(flat).toMatch(/@keyframes shellSlideInLeft \{ from \{ transform: translateX\(-100%\)/)
})

it('runs only while the wallet is open and leaves no end transform', () => {
  // body.suspend is set while tray.open is false, so each reopen restarts the animation.
  expect(flat).not.toMatch(/shellSlideIn(Right|Left) [^;]*(forwards|both)/)
})

it('disables the slide for reduced-motion users', () => {
  expect(flat).toMatch(
    /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.workspace-edge-right:not\(\.suspend\) #panel[^}]*animation: none !important/
  )
})
