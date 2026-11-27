// Probe for packages that ship the Parcel main bundle (Windows). Only EXTERNAL packages sit in
// node_modules and only the bundle ENTRIES are files, so check those; the Linux and macOS probes cover
// the module behavior. The verifier passes both lists in SAF0O_PACKAGE_BUNDLE.
const { createRequire } = require('node:module')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.join(process.resourcesPath, 'app.asar')
const appModules = path.join(appRoot, 'node_modules')
const fromApp = createRequire(path.join(appRoot, 'package.json'))
const packageVersion = (module) => require(path.join(appModules, module, 'package.json')).version
const { externals, entries } = JSON.parse(process.env.SAF0O_PACKAGE_BUNDLE)

const nativeModules = {
  nodeHid: typeof fromApp('node-hid').devices,
  usb: typeof fromApp('usb').getDeviceList,
  ledgerNodeHid: typeof fromApp('@ledgerhq/hw-transport-node-hid-noevents').default,
  secp256k1: typeof fromApp('secp256k1').ecdsaSign,
  keccak: typeof fromApp('keccak')
}

const rendererBundleNoncesValid = ['tray', 'dash', 'dapp', 'onboard'].every((renderer) => {
  const html = fs.readFileSync(path.join(appRoot, 'bundle', `${renderer}.html`), 'utf8')
  const nonces = new Set([...html.matchAll(/'nonce-([^']+)'/g)].map((match) => match[1]))
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag)
  const [nonce] = nonces
  return (
    nonces.size === 1 &&
    scripts.length > 0 &&
    scripts.every((tag) => {
      const match = tag.match(/\bnonce\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
      return match && (match[1] || match[2] || match[3]) === nonce
    })
  )
})

const packagedMetadata = require(path.join(appRoot, 'package.json'))
process.stdout.write(
  JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    abi: process.versions.modules,
    desktopName: packagedMetadata.desktopName,
    packageVersion: packagedMetadata.version,
    buildIdentity: require(path.join(appRoot, 'compiled/main/build-identity.json')),
    rendererBuildIdentity: require(path.join(appRoot, 'bundle/build-identity.json')),
    rendererBundleNoncesValid,
    nativeModules,
    versions: {
      nodeHid: packageVersion('node-hid'),
      usb: packageVersion('usb'),
      ledgerNodeHid: packageVersion('@ledgerhq/hw-transport-node-hid-noevents')
    },
    missingExternals: externals.filter((name) => !fs.existsSync(path.join(appModules, name, 'package.json'))),
    missingEntries: entries.filter((entry) => !fs.existsSync(path.join(appRoot, 'compiled/main', entry)))
  })
)
