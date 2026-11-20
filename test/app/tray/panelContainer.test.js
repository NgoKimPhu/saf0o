import fs from 'fs'
import path from 'path'
import stylus from 'stylus'

// The tray window is wider than #panel (425 px) while the left pane is open, so a viewport
// @media (max-width) never matches and the narrow layouts are skipped (Receive/Send overlap
// the Known value card). Width breakpoints must query #panel through @container.
const toCss = (file) => stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()

const styl = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? styl(p) : p.endsWith('.styl') ? [p] : []
  })

it('makes #panel a named inline-size container', () => {
  const view = toCss('app/tray/index.styl')
  expect(view).toMatch(/#panel \{[^}]*container-name: panel;[^}]*container-type: inline-size;/)
})

it('uses no viewport width media queries in tray styles', () => {
  for (const file of styl('app/tray')) {
    expect({ file, css: toCss(file).match(/@media[^{]*width[^{]*/g) }).toEqual({ file, css: null })
  }
})

it('keeps the portfolio card breakpoint on the panel container', () => {
  const view = toCss('app/tray/Account/style/account.styl')
  expect(view).toMatch(/@container panel \(max-width: 550px\) \{\s*\.accountPortfolioCard/)
})
