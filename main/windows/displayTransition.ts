export function shouldSuppressRepeatedShow(recentDisplayEvent: boolean, currentlyVisible: boolean) {
  return recentDisplayEvent && currentlyVisible
}

export function shouldAnimateShell(currentlyVisible: boolean, prefersReducedMotion: boolean) {
  return currentlyVisible && !prefersReducedMotion
}

export function shouldAnimateWorkspaceOpen(
  workspaceLoaded: boolean,
  trayVisible: boolean,
  workspaceSettled: boolean,
  prefersReducedMotion: boolean
) {
  return workspaceLoaded && shouldAnimateShell(trayVisible && !workspaceSettled, prefersReducedMotion)
}

export function shouldAnimateWorkspaceClose(
  trayVisible: boolean,
  workspaceSettled: boolean,
  prefersReducedMotion: boolean
) {
  return shouldAnimateShell(trayVisible && !workspaceSettled, prefersReducedMotion)
}

// The open dashboard does not keep the wallet up: clicking another app hides both, as it does
// the wallet alone. Onboarding and a dapp frame still hold it open.
export function shouldAutoHideOnBlur(autoHideOn: boolean, onboardShowing: boolean, frameShowing: boolean) {
  return autoHideOn && !onboardShowing && !frameShowing
}

// The tray slides out over 40 ms (app/tray/index.styl, .suspend). Main hides the window after the
// slide; the extra 20 ms covers the store sync that tells the renderer to start it.
export const TRAY_SLIDE_OUT_MS = 60
