import {
  applyWindowTransparencyCss,
  normalizeWindowTransparency,
  windowBackgroundMaterial,
  windowCanvasAlpha
} from '../../../../resources/domain/windowTransparency'

it('defaults to 30% and rejects unreadable or malformed values', () => {
  expect(normalizeWindowTransparency(undefined)).toBe(30)
  expect(normalizeWindowTransparency(0)).toBe(0)
  expect(normalizeWindowTransparency(60)).toBe(60)
  expect(normalizeWindowTransparency(61)).toBe(30)
  expect(normalizeWindowTransparency(-1)).toBe(30)
  expect(normalizeWindowTransparency('45')).toBe(30)
  expect(normalizeWindowTransparency(12.5)).toBe(30)
})

it('fades only the canvas: css alpha is 1 - transparency', () => {
  expect(windowCanvasAlpha(30)).toBe(0.7)
  expect(windowCanvasAlpha(0)).toBe(1)
  const root = document.createElement('div')
  applyWindowTransparencyCss(root, 45)
  expect(root.style.getPropertyValue('--saf0o-window-alpha')).toBe('0.55')
})

it('uses acrylic only on Windows and only when transparency is on', () => {
  expect(windowBackgroundMaterial('win32', 30)).toBe('acrylic')
  expect(windowBackgroundMaterial('win32', 0)).toBe('none')
  expect(windowBackgroundMaterial('linux', 30)).toBe('none')
  expect(windowBackgroundMaterial('darwin', 30)).toBe('none')
})
