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
