import electron from 'electron'
import { FrameInstance } from './frameInstances'

export default (window: FrameInstance) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea
  const screenSize = area
  const [windowWidth] = window.getSize()
  if (windowWidth === undefined) throw new Error('Saf0o window width is unavailable')
  return {
    x: Math.floor(screenSize.x + screenSize.width - windowWidth),
    y: screenSize.y
  }
}
