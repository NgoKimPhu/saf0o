export function pnpmCliInvocation(executable = process.execPath, pnpmCli = process.env.npm_execpath) {
  if (!pnpmCli) throw new Error('npm_execpath is unavailable; run this check through pnpm')
  return { executable, args: [pnpmCli, '--version'] }
}
