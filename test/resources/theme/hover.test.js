import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

// A hovered or pressed row gets one translucent tint (--saf0o-hover / --saf0o-pressed). A solid
// near-black fill is far darker than the transparent window behind it and read as a hole.
const files = execFileSync('git', ['ls-files', 'app/*.styl', 'resources/*.styl'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !file.includes('Native/'))

// Semantic and accent fills (primary/danger/good/bad buttons) keep their own colours.
const allowed = [
  /^var\(--saf0o-(hover|pressed|surface-hover|surface-active|ledger-hover)\)( !important)?$/,
  /^(transparent|none|inherit)$/,
  /var\(--saf0o-(accent|danger|warning|success|control-texture|focus)/,
  /var\(--(good|bad|pending)/,
  /^(unquote\('color-mix|color-mix|linear-gradient\(90deg, transparent)/, // scrollbar thumbs and shimmer
  /^var\(--saf0o-text-/, // toggle thumbs
  /^rgba\([^)]*, \.(0\d*|1[0-4]?)\)$/
]

const offenders = () =>
  files.flatMap((file) => {
    const stack = []
    return readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const text = line.trim()
        if (!text || text.startsWith('//')) return []
        const indent = line.match(/^ */)[0].length
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
        const match = text.match(/^background(?:-color)? (.+)$/)
        if (!match) {
          stack.push({ indent, selector: text })
          return []
        }
        const inHover = stack.some(({ selector }) => /:(hover|active)/.test(selector))
        return inHover && !allowed.some((pattern) => pattern.test(match[1]))
          ? [`${file}:${index + 1} ${text}`]
          : []
      })
  })

it('uses only the translucent hover tint or a semantic fill on hovered and pressed rules', () => {
  expect(offenders()).toEqual([])
})

it('defines the hover and pressed tints as light translucent whites', () => {
  const base = readFileSync('resources/base.styl', 'utf8')
  expect(base).toContain('--saf0o-hover rgba(255, 255, 255, .05)')
  expect(base).toContain('--saf0o-pressed rgba(255, 255, 255, .08)')
  expect(base).toContain('--saf0o-surface-hover var(--saf0o-hover)')
})
