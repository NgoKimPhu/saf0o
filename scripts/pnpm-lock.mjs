import { readFileSync } from 'node:fs'
import path from 'node:path'

// Minimal reader for pnpm-lock.yaml (lockfileVersion 9): root importer deps, package
// integrity, and snapshot dependency edges. Avoids a YAML dependency for release tooling.
const unquote = (value) => value.trim().replace(/^'(.*)'$/, '$1')
const stripPeers = (value) => value.replace(/\(.*$/, '')
// `name: 1.0.0(peers)` -> `name@1.0.0`; an alias value `name: real@1.0.0` -> `real@1.0.0`.
const toRef = (name, value) => {
  const version = stripPeers(unquote(value))
  return version.includes('@') ? version : `${name}@${version}`
}

export function parsePnpmLock(text, root = process.cwd()) {
  if (!/^lockfileVersion: '9\./m.test(text)) throw new Error('Expected pnpm lockfileVersion 9')
  const importer = { dependencies: {}, devDependencies: {}, optionalDependencies: {} }
  const integrity = new Map() // `name@version` -> sha512 integrity
  // `name@version` -> Map(alias -> `name@version`). Peer suffixes are stripped, so peer
  // variants of one package merge into the union of their edges.
  const snapshots = new Map()
  let section = ''
  let inRootImporter = false
  let group = ''
  let entry = ''
  let snapshot = null
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      section = line.replace(/:.*/, '')
      inRootImporter = false
      continue
    }
    if (section === 'importers') {
      if (/^ {2}\S/.test(line)) inRootImporter = line === '  .:'
      else if (!inRootImporter) continue
      else if (/^ {4}\S/.test(line)) group = line.trim().replace(/:$/, '')
      else if (/^ {6}\S/.test(line)) entry = unquote(line.trim().replace(/:$/, ''))
      else if (/^ {8}version: /.test(line) && importer[group]) {
        importer[group][entry] = toRef(entry, line.slice(line.indexOf(':') + 1))
      }
    } else if (section === 'packages') {
      const key = /^ {2}(\S.*):$/.exec(line)
      if (key) entry = stripPeers(unquote(key[1]))
      const hash = /^ {4}resolution: \{integrity: (sha512-[A-Za-z0-9+/=]+)\}$/.exec(line)
      if (hash) integrity.set(entry, hash[1])
    } else if (section === 'snapshots') {
      const key = /^ {2}(\S.*?):( \{\})?$/.exec(line)
      if (key) {
        const ref = stripPeers(unquote(key[1]))
        snapshot = snapshots.get(ref) ?? new Map()
        snapshots.set(ref, snapshot)
        group = ''
      } else if (/^ {4}(dependencies|optionalDependencies):$/.test(line)) group = 'edges'
      else if (/^ {4}\S/.test(line)) group = ''
      else if (group === 'edges') {
        const edge = /^ {6}(\S.*?): (\S.*)$/.exec(line)
        if (!edge) continue
        snapshot.set(unquote(edge[1]), toRef(unquote(edge[1]), edge[2]))
      }
    }
  }
  // A `file:` dependency has no registry version; use the version of the local package.
  const resolveRef = (ref) => {
    const at = ref.lastIndexOf('@')
    const version = ref.slice(at + 1)
    if (!version.startsWith('file:')) return ref
    const local = JSON.parse(readFileSync(path.join(root, version.slice(5), 'package.json'), 'utf8'))
    return `${ref.slice(0, at)}@${local.version}`
  }
  return { importer, integrity, snapshots, resolveRef }
}

export const readPnpmLock = (root = process.cwd()) =>
  parsePnpmLock(readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'), root)

// Locked version of a direct dependency, or of `name` as resolved by `parent` when given.
export function lockedVersion(lock, name, parent) {
  if (parent) {
    const ref = lock.snapshots.get(`${parent}@${lockedVersion(lock, parent)}`)?.get(name)
    return ref && lock.resolveRef(ref).slice(name.length + 1)
  }
  const { dependencies, devDependencies, optionalDependencies } = lock.importer
  const ref = dependencies[name] ?? optionalDependencies[name] ?? devDependencies[name]
  return ref && lock.resolveRef(ref).slice(name.length + 1)
}

// Production closure as Map(`name@version` -> Set(child refs)), keyed from the root importer.
export function productionGraph(lock, rootRef) {
  const graph = new Map([[rootRef, new Set()]])
  const walk = (parentRef, edges) => {
    for (const raw of edges) {
      const ref = lock.resolveRef(raw)
      graph.get(parentRef).add(ref)
      if (graph.has(ref)) continue
      graph.set(ref, new Set())
      walk(ref, lock.snapshots.get(raw)?.values() ?? [])
    }
  }
  const { dependencies, optionalDependencies } = lock.importer
  walk(rootRef, Object.values({ ...dependencies, ...optionalDependencies }))
  return graph
}

// CycloneDX library component for a `name@version` ref, with the lockfile SHA-512 as its hash.
export function componentFor(lock, reference) {
  const at = reference.lastIndexOf('@')
  const [name, version] = [reference.slice(0, at), reference.slice(at + 1)]
  const integrity = lock.integrity.get(reference)
  const [group, bare] = name.startsWith('@') ? name.split('/') : [undefined, name]
  return {
    'bom-ref': reference,
    type: 'library',
    ...(group && { group }),
    name: bare,
    version,
    scope: 'required',
    ...(integrity && {
      hashes: [{ alg: 'SHA-512', content: Buffer.from(integrity.slice(7), 'base64').toString('hex') }]
    }),
    purl: `pkg:npm/${name.replace('@', '%40')}@${version}`
  }
}
