import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { componentFor, parsePnpmLock, productionGraph as collectProductionGraph } from './pnpm-lock.mjs'
import { releaseSbomSerial } from './sbom-identity.mjs'
import { readSourceIdentity } from './source-identity.mjs'

const output = process.argv[2]
if (!output) throw new Error('Usage: node scripts/generate-sbom.mjs <output.json>')

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lockText = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')
const lock = parsePnpmLock(lockText, fileURLToPath(new URL('..', import.meta.url)))

const rootRef = `${packageJson.name}@${packageJson.version}`
const productionGraph = collectProductionGraph(lock, rootRef)
const { commit: sourceCommit, timestamp: sourceTimestamp } = readSourceIdentity()
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  serialNumber: releaseSbomSerial({
    name: packageJson.name,
    version: packageJson.version,
    sourceCommit,
    packageLock: lockText
  }),
  metadata: {
    timestamp: new Date(sourceTimestamp).toISOString(),
    component: {
      'bom-ref': rootRef,
      type: 'application',
      name: packageJson.name,
      version: packageJson.version,
      properties: [{ name: 'wren:source-commit', value: sourceCommit }]
    }
  },
  components: [...productionGraph.keys()]
    .filter((reference) => reference !== rootRef)
    .map((reference) => componentFor(lock, reference))
}

const electronVersion = packageJson.devDependencies?.electron
if (typeof electronVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(electronVersion)) {
  throw new Error('Electron must have an exact version for SBOM generation')
}

const electronRef = `pkg:github/electron/electron@v${electronVersion}`
sbom.components = [
  ...sbom.components,
  {
    'bom-ref': electronRef,
    type: 'framework',
    name: 'Electron',
    version: electronVersion,
    scope: 'required',
    purl: electronRef,
    properties: [{ name: 'wren:packaged-runtime', value: 'true' }]
  }
].sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref']))

productionGraph.get(rootRef).add(electronRef)
productionGraph.set(electronRef, new Set())
sbom.dependencies = [...productionGraph.entries()]
  .map(([ref, dependsOn]) => ({ ref, dependsOn: [...dependsOn].sort() }))
  .sort((left, right) => left.ref.localeCompare(right.ref))

const destination = resolve(output)
const temporary = `${destination}.${process.pid}.tmp`
await mkdir(dirname(destination), { recursive: true })
await writeFile(temporary, `${JSON.stringify(sbom, null, 2)}\n`, { mode: 0o600 })
await rename(temporary, destination)
