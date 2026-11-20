// Bundles compiled/main (tsc output) into compiled-bundle/ with Parcel, the layout of compiled/main.
// Only the entries below are real files at runtime: each is forked or loaded by path.
// Packages in EXTERNAL (build/main-bundle.js) stay in node_modules.
import { Parcel } from '@parcel/core'
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

export const ENTRIES = [
  'index.js',
  'externalData/balances/worker.js',
  'signers/hot/SeedSigner/worker.js',
  'signers/hot/RingSigner/worker.js',
  'windows/viewPreload.js'
]
export const { EXTERNAL } = require('../build/main-bundle.js')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'compiled/main')
const out = path.join(root, 'compiled-bundle')

// Parcel rewrites __dirname to resolve(__dirname, <source dir relative to the output root>). Re-point
// it at the same directory inside the output, which has the layout of compiled/main.
export function rewriteDirname(code, file) {
  return code.replace(/\.resolve\(__dirname,\s*"([^"]+)"\)/g, (match, rel) => {
    const target = path.resolve(out, rel)
    if (target !== src && !target.startsWith(src + path.sep)) {
      throw new Error(`${file}: __dirname points outside compiled/main: ${rel}`)
    }
    const finalDir = path.join(src, path.relative(out, path.dirname(file)))
    return `.resolve(__dirname,${JSON.stringify(path.relative(finalDir, target) || '.')})`
  })
}

async function copyAssets(dir = src) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name)
    if (entry.isDirectory()) await copyAssets(from)
    else if (!/\.(js|map)$/.test(entry.name)) {
      await cp(from, path.join(out, path.relative(src, from)), { recursive: true })
    }
  }
}

async function jsFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await jsFiles(full)))
    else if (entry.name.endsWith('.js')) files.push(full)
  }
  return files
}

// Fails the build when a path-loaded entry is missing, or when a native-binding loader was bundled
// instead of left external (it would look for its .node files next to the bundle).
export async function verifyBundle(dir = out) {
  for (const entry of ENTRIES) await readFile(path.join(dir, entry))
  for (const file of await jsFiles(dir)) {
    const code = await readFile(file, 'utf8')
    if (/node-gyp-build|prebuilds/.test(code)) {
      throw new Error(
        `${path.relative(dir, file)} bundles a native-binding loader; add the package to EXTERNAL`
      )
    }
  }
}

export async function parcelBuild(entries, distDir) {
  const bundler = new Parcel({
    entries,
    config: path.join(root, 'scripts/main-bundle/.parcelrc'),
    shouldDisableCache: true,
    shouldAutoInstall: false,
    mode: 'production',
    defaultTargetOptions: { shouldOptimize: !process.env.MAIN_BUNDLE_NO_MINIFY, sourceMaps: false },
    targets: {
      main: {
        context: 'electron-main',
        engines: { electron: '>=45' },
        distDir,
        includeNodeModules: Object.fromEntries(EXTERNAL.map((name) => [name, false]))
      }
    }
  })
  await bundler.run()
}

export async function bundleMain() {
  await rm(out, { recursive: true, force: true })
  await parcelBuild(
    ENTRIES.map((entry) => path.join(src, entry)),
    out
  )
  for (const file of await jsFiles(out)) {
    const code = await readFile(file, 'utf8')
    const rewritten = rewriteDirname(code, file)
    if (rewritten !== code) await writeFile(file, rewritten)
  }
  await copyAssets()
  await verifyBundle()
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await bundleMain()
  console.log(`Bundled main process into ${path.relative(root, out)}`)
}
