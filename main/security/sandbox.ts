interface CommandLine {
  hasSwitch(name: string): boolean
}

export function assertSandboxEnabled(commandLine: CommandLine, environment = process.env.NODE_ENV) {
  if (environment !== 'development' && commandLine.hasSwitch('no-sandbox')) {
    throw new Error('Saf0o refuses to run without the Chromium sandbox')
  }
}
