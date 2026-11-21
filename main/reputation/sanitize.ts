// Remote names are attacker-chosen: drop control and bidi/format characters, collapse spaces, cap length.
export const sanitizeName = (value: unknown, max = 64): string | undefined => {
  if (typeof value !== 'string') return undefined
  const clean = value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, max)
    .trim()
  return clean || undefined
}
