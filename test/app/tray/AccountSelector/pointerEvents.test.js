import fs from 'fs'
import stylus from 'stylus'

// .accountSwitcherBar sets pointer-events: none so the header strip does not block the panel;
// each interactive child must opt back in. The dashboard toggle moved out of
// .accountSwitcherControls to lead the bar, lost the inherited `auto` and stopped taking hover
// and clicks (jsdom tests cannot see this: they apply no stylesheets).
const file = 'app/tray/AccountSelector/style/index.styl'
const view = stylus(fs.readFileSync(file, 'utf8')).set('filename', file).render()

it('lets the bar pass clicks through but re-enables them on the dashboard toggle', () => {
  expect(view).toMatch(/\.accountSwitcherBar \{[^}]*pointer-events: none;/)
  const optIn = [...view.matchAll(/([^{}]+)\{[^}]*pointer-events: auto;[^}]*\}/g)].map((m) => m[1])
  expect(optIn.some((selectors) => /\.accountWorkspaceToggle\b/.test(selectors))).toBe(true)
})
