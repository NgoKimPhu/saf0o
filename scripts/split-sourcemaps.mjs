// Moves source maps out of a build directory so they are never packaged: each map goes to
// <sourcemaps>/<name>/<relative path>.map, and the sourceMappingURL comment is stripped from the
// shipped file (inline data: maps are extracted too). Usage: node scripts/split-sourcemaps.mjs <dir> <name>
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const sourcemapsDir = path.join(root, 'sourcemaps')

const COMMENT = /\n?(?:\/\/# sourceMappingURL=(\S+)|\/\*# sourceMappingURL=(\S+?) \*\/)\s*$/

async function walk(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

export async function splitSourceMaps(dir, name, outRoot = sourcemapsDir) {
  const out = path.join(outRoot, name)
  await rm(out, { recursive: true, force: true })
  let count = 0
  const save = async (file, map) => {
    const target = path.join(out, `${path.relative(dir, file)}.map`)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, map)
    count++
  }
  for (const file of await walk(dir)) {
    if (/\.(js|css)$/.test(file)) {
      const code = await readFile(file, 'utf8')
      const match = COMMENT.exec(code)
      if (!match) continue
      const url = match[1] || match[2]
      if (url.startsWith('data:')) {
        await save(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
      } else {
        await save(file, await readFile(path.resolve(path.dirname(file), url)))
        await rm(path.resolve(path.dirname(file), url), { force: true })
      }
      await writeFile(file, code.slice(0, match.index))
    }
  }
  for (const file of await walk(dir)) if (file.endsWith('.map')) await rm(file)
  return count
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const [dir, name] = process.argv.slice(2)
  console.log(`Moved ${await splitSourceMaps(path.resolve(dir), name)} source maps to sourcemaps/${name}`)
}
