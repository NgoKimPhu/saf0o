// Parcel's default resolver ignores package.json "exports" unless the root package.json opts in,
// and that opt-in would change the renderer builds too. This resolver enables it for the main bundle only.
// It also keeps Node builtins external: the root package.json "alias" block stubs stream, path, crypto,
// buffer etc. for the renderers, and that would otherwise replace them in the main bundle.
const { builtinModules } = require('node:module')
const { Resolver } = require('@parcel/plugin')
const NodeResolver = require('@parcel/node-resolver-core').default

module.exports = new Resolver({
  loadConfig({ options, logger }) {
    return new NodeResolver({
      fs: options.inputFS,
      projectRoot: options.projectRoot,
      packageManager: options.packageManager,
      shouldAutoInstall: false,
      mode: options.mode,
      logger,
      packageExports: true
    })
  },
  resolve({ dependency, specifier, config: resolver }) {
    if (builtinModules.includes(specifier.replace(/^node:/, ''))) return { isExcluded: true }
    return resolver.resolve({
      filename: specifier,
      specifierType: dependency.specifierType,
      range: dependency.range,
      parent: dependency.resolveFrom,
      env: dependency.env,
      sourcePath: dependency.sourcePath,
      loc: dependency.loc,
      packageConditions: dependency.packageConditions
    })
  }
})
