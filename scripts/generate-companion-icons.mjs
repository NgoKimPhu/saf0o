import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { resizePng } from './brand-resample.mjs'

// Usage: node scripts/generate-companion-icons.mjs <saf0o-companion checkout>
// Writes src/icon.png and src/icons/* from the desktop app icon master.
const companion = path.resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Usage: generate-companion-icons.mjs <companion-dir>')
const master = PNG.sync.read(await readFile('asset/brand/saf0o-app-icon-master.png'))
const icons = path.join(companion, 'src', 'icons')
await mkdir(icons, { recursive: true })
await copyFile('asset/brand/exports/app/saf0o-app-icon-512.png', path.join(companion, 'src', 'icon.png'))

// Disconnected state: luminance only, dimmed. Connected state and the plain icon are the colour icon.
const moon = (png) => {
  const out = new PNG({ width: png.width, height: png.height })
  for (let i = 0; i < png.data.length; i += 4) {
    const luma = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
    out.data.fill(Math.round(luma * 0.6), i, i + 3)
    out.data[i + 3] = png.data[i + 3]
  }
  return out
}

for (const size of [16, 48, 96]) {
  const png = resizePng(master, size)
  const color = PNG.sync.write(png)
  await writeFile(path.join(icons, `icon${size}.png`), color)
  await writeFile(path.join(icons, `icon${size}good.png`), color)
  await writeFile(path.join(icons, `icon${size}moon.png`), PNG.sync.write(moon(png)))
}

// Store icon: the 96px master centred in a 128px canvas with a 16px safe area.
const store = new PNG({ width: 128, height: 128 })
PNG.bitblt(master, store, 0, 0, 96, 96, 16, 16)
await writeFile(path.join(icons, 'icon128.png'), PNG.sync.write(store))
console.log('Saf0o companion icons generated')
