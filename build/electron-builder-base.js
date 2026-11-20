const config = {
  appId: 'io.github.ngokimphu.saf0o',
  productName: 'Saf0o',
  npmRebuild: false,
  electronLanguages: ['en-US'],
  files: [
    'compiled',
    'bundle',
    '!compiled/main/dev',
    '!node_modules/**/*.map',
    '!node_modules/**/*.d.{ts,cts,mts}',
    '!node_modules/@ledgerhq/{domain-service,evm-tools}/src/__tests__/**/*'
  ]
}

module.exports = config
