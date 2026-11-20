export const DEFAULT_WINDOW_TRANSPARENCY = 30
// Above this the panel text loses contrast over bright wallpapers.
export const MAX_WINDOW_TRANSPARENCY = 60

export function normalizeWindowTransparency(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_WINDOW_TRANSPARENCY
    ? (value as number)
    : DEFAULT_WINDOW_TRANSPARENCY
}

// CSS alpha of the window canvas: the content stays readable, only the canvas fades.
export const windowCanvasAlpha = (transparency: number) =>
  (100 - normalizeWindowTransparency(transparency)) / 100

export const windowBackgroundMaterial = (platform: string, transparency: number) =>
  platform === 'win32' && normalizeWindowTransparency(transparency) > 0 ? 'acrylic' : 'none'

export const applyWindowTransparencyCss = (root: HTMLElement, transparency: number) =>
  root.style.setProperty('--saf0o-window-alpha', String(windowCanvasAlpha(transparency)))
