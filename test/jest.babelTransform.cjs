// babel-jest bundles its own Babel 7 core, which cannot run the Babel 8 presets in .babelrc.json.
// This transformer runs the root @babel/core (8) and adds only the jest.mock hoisting plugin.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const babel = require('@babel/core')
const jestHoist = require('babel-plugin-jest-hoist')

const rootDir = path.resolve(__dirname, '..')
const hoist = jestHoist.default || jestHoist

module.exports = {
  canInstrument: false,

  getCacheKey(sourceText, sourcePath, { config, configString, transformerConfig = {} }) {
    const babelrc = path.resolve(rootDir, transformerConfig.configFile || '.babelrc.json')
    return crypto
      .createHash('sha256')
      .update('jest-babel8')
      .update(babel.version)
      .update(fs.readFileSync(babelrc))
      .update(JSON.stringify(transformerConfig))
      .update(configString)
      .update(sourceText)
      .update(path.relative(config.rootDir, sourcePath))
      .digest('hex')
  },

  process(
    sourceText,
    sourcePath,
    {
      transformerConfig = {},
      supportsStaticESM,
      supportsDynamicImport,
      supportsTopLevelAwait,
      supportsExportNamespaceFrom
    }
  ) {
    const result = babel.transformSync(sourceText, {
      ...transformerConfig,
      cwd: rootDir,
      filename: sourcePath,
      plugins: [...(transformerConfig.plugins || []), hoist],
      caller: {
        name: 'babel-jest',
        supportsDynamicImport,
        supportsExportNamespaceFrom,
        supportsStaticESM,
        supportsTopLevelAwait
      },
      sourceMaps: 'both'
    })

    return { code: result.code, map: result.map }
  }
}
