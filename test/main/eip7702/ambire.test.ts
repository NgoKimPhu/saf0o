import { keccak256, toUtf8Bytes } from 'ethers'

import {
  decodePrivilege,
  encodeExecuteBySender,
  encodePrivileges,
  encodeSetAddrPrivilege
} from '../../../main/eip7702/ambire'

const selector = (signature: string) => keccak256(toUtf8Bytes(signature)).slice(0, 10)
const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')
const TARGET = '0x1111111111111111111111111111111111111111'
const KEY = '0x2222222222222222222222222222222222222222'
const PRIV = `0x${'00'.repeat(31)}02`

// The account runs these bytes as itself. A wrong selector or layout would revert or, worse, call
// another function, so the encoding is pinned to the AmbireAccount ABI word by word.
describe('Ambire account call encoding', () => {
  it('encodes executeBySender((address,uint256,bytes)[]) with the standard ABI layout', () => {
    expect(encodeExecuteBySender([{ to: TARGET, value: 5n, data: '0xabcd' }])).toBe(
      selector('executeBySender((address,uint256,bytes)[])') +
        word('20') + // offset of the array
        word('1') + // array length
        word('20') + // offset of tuple 0
        word(TARGET) +
        word('5') +
        word('60') + // offset of data inside the tuple
        word('2') + // data length
        'abcd'.padEnd(64, '0')
    )
  })

  it('rejects an empty batch and a contract creation', () => {
    expect(() => encodeExecuteBySender([])).toThrow()
    expect(() => encodeExecuteBySender([{ value: 0n, data: '0x60' } as never])).toThrow('destination')
  })

  it('encodes setAddrPrivilege(address,bytes32) and privileges(address)', () => {
    expect(encodeSetAddrPrivilege(KEY, PRIV)).toBe(
      selector('setAddrPrivilege(address,bytes32)') + word(KEY) + word(PRIV)
    )
    expect(encodePrivileges(KEY)).toBe(selector('privileges(address)') + word(KEY))
  })

  it('decodes a bytes32 privilege and rejects other return data', () => {
    expect(decodePrivilege(`0x${'00'.repeat(31)}0A`)).toBe(`0x${'00'.repeat(31)}0a`)
    expect(() => decodePrivilege('0x')).toThrow()
    expect(() => decodePrivilege(`0x${'00'.repeat(33)}`)).toThrow()
  })
})
