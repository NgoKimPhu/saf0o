const fs = require('node:fs')
const path = require('node:path')

// Packages the main-process bundle leaves in node_modules (see scripts/bundle-main.mjs): native
// bindings, ESM loaded through `new Function`, and packages that read their own files by __dirname.
const EXTERNAL = [
  'electron',
  'electron-log',
  'usb',
  'node-hid',
  // Needs its own nested node-hid 2.1.2. Bundled, its require('node-hid') would load the top-level 3.4.0.
  '@ledgerhq/hw-transport-node-hid-noevents',
  'secp256k1',
  'keccak',
  'multiformats',
  'ipfs-unixfs-importer'
]

// Directory of each external package and of its runtime dependencies, as `node_modules/...` paths
// relative to the repository root. Resolved like Node does, so nested versions are kept apart.
function externalModuleDirs(root = path.resolve(__dirname, '..')) {
  const seen = new Set()
  const visit = (from, name) => {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name)
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        if (seen.has(candidate)) return
        seen.add(candidate)
        const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'))
        const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies }
        Object.keys(dependencies).forEach((dependency) => visit(candidate, dependency))
        return
      }
      if (dir === path.dirname(dir) || dir === path.dirname(root)) return
    }
  }
  // electron is provided by the runtime and is a devDependency, so it is never packaged
  EXTERNAL.filter((name) => name !== 'electron').forEach((name) => visit(root, name))
  return [...seen].map((dir) => path.relative(root, dir).split(path.sep).join('/')).sort()
}

// electron-builder `files` entries for an app that ships the bundle instead of compiled/ and the
// full dependency tree. Later patterns re-include the externals after the blanket exclusion.
function mainBundleFiles(root) {
  return [
    { from: 'compiled-bundle', to: 'compiled/main' },
    'package.json',
    'bundle',
    '!node_modules/**',
    ...externalModuleDirs(root).map((dir) => `${dir}/**`),
    '!node_modules/**/*.map',
    '!node_modules/**/*.d.{ts,cts,mts}',
    '!node_modules/@ledgerhq/{domain-service,evm-tools}/src/__tests__/**/*'
  ]
}

module.exports = { EXTERNAL, externalModuleDirs, mainBundleFiles }
