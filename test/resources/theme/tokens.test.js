import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

// Type, radius and spacing come from the --saf0o-* scales in resources/base.styl, so sibling cards,
// rows and buttons cannot drift to one-off 10px/14px/15px values again.
const files = execFileSync('git', ['ls-files', 'app/*.styl', 'resources/*.styl'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && file !== 'resources/base.styl')

const offScale = (property, allowed, structural = Infinity) =>
  files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, index) => ({ file, line: line.trim(), index: index + 1 }))
      .filter(({ line }) => !line.startsWith('//') && property.test(line) && !line.includes('calc('))
      .filter(({ line }) =>
        [...line.matchAll(/(?<![\d.-])(\d+)px/g)].some(
          (m) => !allowed.includes(Number(m[1])) && Number(m[1]) < structural
        )
      )
      .map(({ file: f, line, index }) => `${f}:${index} ${line}`)
  )

it('uses the type scale for font sizes', () => {
  // 7px, 10px and 28px+ are glyph and display sizes outside the text scale.
  expect(offScale(/^font-size /, [2, 7, 10, 28, 30, 40])).toEqual([])
})

it('uses the radius scale for corners', () => {
  // 1-4px are hairline corners; 18px+ are pills and round marks.
  expect(offScale(/^border-radius /, [0, 1, 2, 3, 4, 18, 19, 20, 23, 24, 26, 27, 30, 999])).toEqual([])
})

// 28px and up are structural clearances (header, dock, scrollbar gutters), not rhythm.
it('uses the space scale for padding, margin and gap', () => {
  expect(offScale(/^(padding|margin|gap|row-gap|column-gap)[a-z-]* /, [0, 1, 2, 3], 28)).toEqual([])
})

it('defines the 8-step type scale once', () => {
  const base = readFileSync('resources/base.styl', 'utf8')
  for (const [name, px] of [
    ['display', 32],
    ['title', 24],
    ['heading', 20],
    ['sub', 18],
    ['lead', 16],
    ['body', 14],
    ['small', 13],
    ['caption', 12]
  ])
    expect(base).toContain(`--saf0o-type-${name} ${px}px`)
})

it('keeps the packed spacing scale: 8px gutter, 8px card padding, nothing above 12px for gaps', () => {
  const base = readFileSync('resources/base.styl', 'utf8')
  const px = (name) => Number(base.match(new RegExp(`--saf0o-${name} (\\d+)px`))[1])
  expect(px('space-2')).toBe(4)
  expect(px('space-4')).toBe(8)
  expect(px('space-6')).toBe(12)
  expect(base).toContain('--saf0o-page-gutter var(--saf0o-space-4)')
})
