import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pnpmCliInvocation } from './toolchain.mjs'

const expectedNode = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim()
const packageFile = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const expectedPnpm = packageFile.packageManager.split('@').at(-1)
const pnpm = pnpmCliInvocation()
const pnpmVersion = execFileSync(pnpm.executable, pnpm.args, {
  encoding: 'utf8'
}).trim()

if (process.version !== `v${expectedNode}`) {
  console.error(`Expected Node ${expectedNode}; run "nvm install && nvm use".`)
  process.exit(1)
}

if (pnpmVersion !== expectedPnpm) {
  console.error(`Expected pnpm ${expectedPnpm}; run "corepack enable && corepack prepare pnpm@${expectedPnpm} --activate".`)
  process.exit(1)
}

console.log(`Using Node ${process.version} and pnpm ${pnpmVersion}`)
