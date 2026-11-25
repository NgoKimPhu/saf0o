// Own file: eth.ts imports it, and importing from Ledger/index would make a cycle.
export class DeviceError extends Error {
  readonly statusCode

  constructor(msg: string, code = -1) {
    super(msg)
    this.statusCode = code
  }
}
