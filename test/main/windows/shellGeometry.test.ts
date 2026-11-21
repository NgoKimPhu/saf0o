import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getShellLayout,
  shapesShellWindow,
  shellMainTargetWidth,
  shellWorkspaceTargetWidth,
  shouldJoinWorkspace
} from '../../../main/windows/shellGeometry'

describe('getShellLayout', () => {
  it('anchors a compact wallet to the right edge', () => {
    expect(getShellLayout({ x: 0, y: 48, width: 1920, height: 1032 }, 'right')).toEqual({
      window: { x: 1495, y: 114, width: 425, height: 900 },
      main: { x: 0, y: 0, width: 425, height: 900 },
      workspace: { x: 0, y: 0, width: 0, height: 900 },
      workspaceOverlaysMain: false
    })
  })

  it('scales physical panes while preserving the right wallet edge', () => {
    const compact = getShellLayout({ x: 0, y: 0, width: 1920, height: 1080 }, 'right', false, 1.25)
    const expanded = getShellLayout({ x: 0, y: 0, width: 1920, height: 1080 }, 'right', true, 1.25)

    expect(compact).toEqual({
      window: { x: 1389, y: 12, width: 531, height: 1056 },
      main: { x: 0, y: 0, width: 531, height: 1056 },
      workspace: { x: 0, y: 0, width: 0, height: 1056 },
      workspaceOverlaysMain: false
    })
    expect(expanded).toEqual({
      window: { x: 858, y: 12, width: 1062, height: 1056 },
      main: { x: 531, y: 0, width: 531, height: 1056 },
      workspace: { x: 0, y: 0, width: 531, height: 1056 },
      workspaceOverlaysMain: false
    })
    expect(expanded.window.x + expanded.main.x).toBe(compact.window.x)
  })

  it('scales overlay thresholds and caps target height to the work area margin', () => {
    expect(getShellLayout({ x: 0, y: 0, width: 1200, height: 1200 }, 'right', true, 1.5)).toEqual({
      window: { x: 562, y: 12, width: 638, height: 1176 },
      main: { x: 0, y: 0, width: 638, height: 1176 },
      workspace: { x: 0, y: 0, width: 638, height: 1176 },
      workspaceOverlaysMain: true
    })
  })

  it('keeps every bound a whole pixel at fractional scales', () => {
    for (const scale of [1.25, 1.5] as const) {
      const layout = getShellLayout({ x: 0, y: 0, width: 1921, height: 1080 }, 'right', true, scale)
      for (const rect of [layout.window, layout.main, layout.workspace])
        for (const value of Object.values(rect)) expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('collapses a left-edge workspace at the wallet seam', () => {
    expect(getShellLayout({ x: 0, y: 0, width: 1920, height: 1080 }, 'left')).toEqual({
      window: { x: 0, y: 90, width: 425, height: 900 },
      main: { x: 0, y: 0, width: 425, height: 900 },
      workspace: { x: 425, y: 0, width: 0, height: 900 },
      workspaceOverlaysMain: false
    })
  })

  it('expands left while keeping the right-edge wallet in place', () => {
    const compact = getShellLayout({ x: 0, y: 48, width: 1920, height: 1032 }, 'right')
    const expanded = getShellLayout({ x: 0, y: 48, width: 1920, height: 1032 }, 'right', true)

    expect(expanded).toEqual({
      window: { x: 1070, y: 114, width: 850, height: 900 },
      main: { x: 425, y: 0, width: 425, height: 900 },
      workspace: { x: 0, y: 0, width: 425, height: 900 },
      workspaceOverlaysMain: false
    })
    expect(expanded.window.x + expanded.main.x).toBe(compact.window.x)
  })

  it('mirrors expansion at the left edge without moving the wallet', () => {
    const compact = getShellLayout({ x: -1920, y: 0, width: 1920, height: 1080 }, 'left')
    const expanded = getShellLayout({ x: -1920, y: 0, width: 1920, height: 1080 }, 'left', true)

    expect(expanded).toEqual({
      window: { x: -1920, y: 90, width: 850, height: 900 },
      main: { x: 0, y: 0, width: 425, height: 900 },
      workspace: { x: 425, y: 0, width: 425, height: 900 },
      workspaceOverlaysMain: false
    })
    expect(expanded.window.x + expanded.main.x).toBe(compact.window.x)
  })

  it('uses all available adjacent width before falling back to an overlay', () => {
    expect(getShellLayout({ x: 0, y: 0, width: 1000, height: 900 }, 'right', true)).toEqual({
      window: { x: 150, y: 12, width: 850, height: 876 },
      main: { x: 425, y: 0, width: 425, height: 876 },
      workspace: { x: 0, y: 0, width: 425, height: 876 },
      workspaceOverlaysMain: false
    })
  })

  it('fits an adjacent workspace inside a common 1366x768 work area', () => {
    expect(getShellLayout({ x: 0, y: 0, width: 1366, height: 768 }, 'right', true)).toEqual({
      window: { x: 516, y: 12, width: 850, height: 744 },
      main: { x: 425, y: 0, width: 425, height: 744 },
      workspace: { x: 0, y: 0, width: 425, height: 744 },
      workspaceOverlaysMain: false
    })
  })

  it('uses the available adjacent workspace on a common 1024x768 work area', () => {
    expect(getShellLayout({ x: 0, y: 0, width: 1024, height: 768 }, 'right', true)).toEqual({
      window: { x: 174, y: 12, width: 850, height: 744 },
      main: { x: 425, y: 0, width: 425, height: 744 },
      workspace: { x: 0, y: 0, width: 425, height: 744 },
      workspaceOverlaysMain: false
    })
  })

  it('overlays the wallet on narrow displays instead of going off-screen', () => {
    expect(getShellLayout({ x: 10, y: 20, width: 800, height: 600 }, 'right', true)).toEqual({
      window: { x: 385, y: 32, width: 425, height: 576 },
      main: { x: 0, y: 0, width: 425, height: 576 },
      workspace: { x: 0, y: 0, width: 425, height: 576 },
      workspaceOverlaysMain: true
    })
  })

  it('never returns dimensions outside an undersized work area', () => {
    expect(getShellLayout({ x: 5, y: 7, width: 320, height: 20 }, 'left', true)).toEqual({
      window: { x: 5, y: 16, width: 320, height: 1 },
      main: { x: 0, y: 0, width: 320, height: 1 },
      workspace: { x: 0, y: 0, width: 320, height: 1 },
      workspaceOverlaysMain: true
    })
  })

  it('joins only an adjacent workspace to the wallet shell', () => {
    const adjacent = getShellLayout({ x: 0, y: 0, width: 1920, height: 1080 }, 'left', true)
    const overlay = getShellLayout({ x: 0, y: 0, width: 800, height: 768 }, 'left', true)
    const collapsedOverlay = getShellLayout({ x: 0, y: 0, width: 800, height: 768 }, 'left')

    expect(shouldJoinWorkspace(adjacent, true)).toBe(true)
    expect(shouldJoinWorkspace(adjacent, false)).toBe(false)
    expect(shouldJoinWorkspace(overlay, true)).toBe(false)
    expect(collapsedOverlay.workspaceOverlaysMain).toBe(true)
    expect(collapsedOverlay.workspace).toEqual({ x: 425, y: 0, width: 0, height: 744 })
    expect(overlay.workspace).toEqual({ x: 0, y: 0, width: 425, height: 744 })
    expect(shouldJoinWorkspace(collapsedOverlay, false)).toBe(false)
  })

  it('keeps the tray stylesheet width equal to the shell width constant', () => {
    const styl = readFileSync(join(__dirname, '../../../app/tray/index.styl'), 'utf8')
    expect(styl).toContain(`shellWidth = ${shellMainTargetWidth}px`)
    expect(styl).not.toMatch(/width 620px/)
  })

  it('makes the dash pane exactly as wide as the wallet panel, from one constant', () => {
    expect(shellWorkspaceTargetWidth).toBe(shellMainTargetWidth)
    for (const scale of [1, 1.25, 1.5] as const) {
      const { main, workspace } = getShellLayout(
        { x: 0, y: 0, width: 3000, height: 1200 },
        'right',
        true,
        scale
      )
      expect(workspace.width).toBe(main.width)
    }
  })
})

// Resizing the window to open the workspace made Windows flash the old frame at the new top-left
// (the panel snapped left before the slide). Windows keeps a full-width window clipped by
// setShape, as Linux does; macOS has no setShape.
it('shapes a full-width shell window on Windows and Linux, not macOS', () => {
  expect(shapesShellWindow('win32')).toBe(true)
  expect(shapesShellWindow('linux')).toBe(true)
  expect(shapesShellWindow('darwin')).toBe(false)
})
