// jsdom omits TextEncoder/TextDecoder, which @noble/hashes 2 needs at import time.
const { TextEncoder, TextDecoder } = require('util')

Object.assign(globalThis, { TextEncoder, TextDecoder })
