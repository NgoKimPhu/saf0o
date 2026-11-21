// Maps a minified stack trace back to source: node scripts/map-stack.mjs <main|bundle> < stack.txt
// Needs the maps from the same build (sourcemaps/<name>/). Uses node:module SourceMap, no dependencies.
import { readFileSync } from 'node:fs'
import { SourceMap } from 'node:module'
import path from 'node:path'
import { sourcemapsDir } from './split-sourcemaps.mjs'

const dir = path.join(sourcemapsDir, process.argv[2] || 'main')
const maps = new Map()
const load = (file) => {
  if (!maps.has(file)) {
    try {
      maps.set(file, new SourceMap(JSON.parse(readFileSync(file, 'utf8'))))
    } catch {
      maps.set(file, null)
    }
  }
  return maps.get(file)
}
// main maps are laid out like compiled/main, renderer maps sit flat in bundle/
const prefix = process.argv[2] === 'bundle' ? /.*[/\\]bundle[/\\]/ : /.*[/\\]compiled[/\\]main[/\\]/
for (const line of readFileSync(0, 'utf8').split('\n')) {
  console.log(
    line.replace(/([^\s(]+\.js):(\d+):(\d+)/g, (all, file, l, c) => {
      const map = load(path.join(dir, `${file.replace(prefix, '')}.map`))
      const hit = map?.findEntry(Number(l) - 1, Number(c) - 1)
      return hit?.originalSource
        ? `${hit.originalSource}:${hit.originalLine + 1}:${hit.originalColumn + 1}`
        : all
    })
  )
}
