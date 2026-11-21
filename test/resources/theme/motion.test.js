import { readFileSync } from 'fs'

// Hover, expand and route transitions share one 120-240ms scale and one easing curve, so the UI
// moves the same everywhere. Window slide/park timing lives in main/windows and is not touched here.
const base = readFileSync('resources/base.styl', 'utf8')
const live = base.split('\n').filter((line) => !line.trim().startsWith('//'))

const token = (name) => live.find((line) => line.trim().startsWith(`--${name} `))

it('maps every legacy transition token onto the Saf0o motion scale', () => {
  for (const name of [
    'standardFaster',
    'standardFast',
    'standard',
    'standardVibe',
    'standardSlow',
    'standardSlower',
    'standardSlowest',
    'slowRocket'
  ])
    expect(token(name)).toMatch(/var\(--saf0o-motion-(fast|standard|slow)\) var\(--saf0o-ease\) all$/)
})

it('keeps the Saf0o durations between 120 and 240ms and defines one easing curve', () => {
  const ms = (name) => Number(token(`saf0o-motion-${name}`).match(/(\d+)ms/)[1])
  expect([ms('fast'), ms('standard'), ms('slow')]).toEqual([120, 180, 240])
  expect(live.filter((line) => line.includes('cubic-bezier'))).toHaveLength(1)
})

it('respects prefers-reduced-motion', () => {
  expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
})
