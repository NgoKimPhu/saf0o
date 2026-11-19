import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { lockedVersion, parsePnpmLock, productionGraph } from './pnpm-lock.mjs'
import { releaseSbomSerial } from './sbom-identity.mjs'
import { readSourceIdentity } from './source-identity.mjs'

const path = process.argv[2]
if (!path) throw new Error('Usage: node scripts/verify-sbom.mjs <sbom.json>')

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lockText = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')
const lock = parsePnpmLock(lockText, fileURLToPath(new URL('..', import.meta.url)))
const sbom = JSON.parse(await readFile(path, 'utf8'))

if (sbom.bomFormat !== 'CycloneDX' || typeof sbom.specVersion !== 'string') {
  throw new Error('SBOM is not a CycloneDX document')
}
if (sbom.metadata?.component?.name !== packageJson.name) {
  throw new Error('SBOM root component does not match package name')
}
if (sbom.metadata?.component?.version !== packageJson.version) {
  throw new Error('SBOM root component does not match package version')
}
if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
  throw new Error('SBOM has no production components')
}

const { commit: sourceCommit, timestamp: sourceTimestamp } = readSourceIdentity()
const expectedSerial = releaseSbomSerial({
  name: packageJson.name,
  version: packageJson.version,
  sourceCommit,
  packageLock: lockText
})
const sourceProperty = sbom.metadata.component.properties?.find(
  (property) => property?.name === 'wren:source-commit'
)
if (
  sbom.serialNumber !== expectedSerial ||
  sbom.metadata.timestamp !== new Date(sourceTimestamp).toISOString() ||
  sourceProperty?.value !== sourceCommit
) {
  throw new Error('SBOM source identity does not match the clean reviewed commit')
}

const references = new Set()
const componentsByReference = new Map()
for (const component of sbom.components) {
  if (typeof component?.['bom-ref'] !== 'string' || references.has(component['bom-ref'])) {
    throw new Error('SBOM contains a missing or duplicate component reference')
  }
  references.add(component['bom-ref'])
  componentsByReference.set(component['bom-ref'], component)

  const lockedIntegrity = lock.integrity.get(component['bom-ref'])
  const sha512 = component.hashes?.find((hash) => hash?.alg === 'SHA-512')?.content
  if (lockedIntegrity && sha512 !== Buffer.from(lockedIntegrity.slice(7), 'base64').toString('hex')) {
    throw new Error(`SBOM hash does not match lockfile integrity for ${component['bom-ref']}`)
  }
}

const rootReference = sbom.metadata.component['bom-ref']
const rootDependency = sbom.dependencies?.find((dependency) => dependency?.ref === rootReference)
if (!rootDependency || !Array.isArray(rootDependency.dependsOn)) {
  throw new Error('SBOM has no root dependency graph')
}
const rootDependencies = new Set(rootDependency.dependsOn)

for (const dependency of Object.keys(packageJson.dependencies || {})) {
  const version = lockedVersion(lock, dependency)
  const reference = version && `${dependency}@${version}`
  if (!reference || !componentsByReference.has(reference) || !rootDependencies.has(reference)) {
    throw new Error(`SBOM is missing direct production dependency ${dependency}`)
  }
}

const electronVersion = packageJson.devDependencies?.electron
const electronReference = `pkg:github/electron/electron@v${electronVersion}`
const electron = componentsByReference.get(electronReference)
const packagedRuntime = electron?.properties?.some(
  (property) => property?.name === 'wren:packaged-runtime' && property.value === 'true'
)
if (electron?.version !== electronVersion || !packagedRuntime || !rootDependencies.has(electronReference)) {
  throw new Error('SBOM is missing the packaged Electron runtime')
}

const expectedGraph = productionGraph(lock, rootReference)
expectedGraph.get(rootReference).add(electronReference)
expectedGraph.set(electronReference, new Set())

const expectedComponents = new Set(expectedGraph.keys())
expectedComponents.delete(rootReference)
if (
  references.size !== expectedComponents.size ||
  [...expectedComponents].some((reference) => !references.has(reference))
) {
  throw new Error('SBOM components do not match the locked production dependency closure')
}

const dependencyGraph = new Map()
for (const dependency of sbom.dependencies || []) {
  if (
    typeof dependency?.ref !== 'string' ||
    dependencyGraph.has(dependency.ref) ||
    !Array.isArray(dependency.dependsOn)
  ) {
    throw new Error('SBOM contains an invalid or duplicate dependency node')
  }
  dependencyGraph.set(dependency.ref, dependency.dependsOn)
}

if (
  dependencyGraph.size !== expectedGraph.size ||
  [...expectedGraph].some(([reference, expectedDependencies]) => {
    const actualDependencies = dependencyGraph.get(reference)
    return (
      !actualDependencies ||
      actualDependencies.length !== expectedDependencies.size ||
      actualDependencies.some((dependency) => !expectedDependencies.has(dependency))
    )
  })
) {
  throw new Error('SBOM graph does not match the locked production dependency graph')
}

const reachable = new Set()
const pending = [rootReference]
while (pending.length) {
  const reference = pending.pop()
  if (reachable.has(reference)) continue
  const dependencies = dependencyGraph.get(reference)
  if (!dependencies) throw new Error(`SBOM graph is missing dependency node ${reference}`)
  reachable.add(reference)
  for (const dependency of dependencies) {
    if (!componentsByReference.has(dependency)) {
      throw new Error(`SBOM graph references missing component ${dependency}`)
    }
    pending.push(dependency)
  }
}
if (reachable.size !== componentsByReference.size + 1) {
  throw new Error('SBOM contains unreachable production components')
}

console.log(`Verified production CycloneDX SBOM with ${sbom.components.length} components`)
