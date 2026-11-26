import { isAllowedDelegate, matchesDelegateCode } from '../../../main/eip7702/delegates'
import { parseAccountCode } from '../../../resources/domain/account/code'

const AMBIRE = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
const AMBIRE_CODE_HASH = '0x386e55cb86f9a31fdb7926ceab54847aa4542b7a0517216144a956982a21ade3'
const OTHER = '0x1111111111111111111111111111111111111111'
const delegatedTo = (address: string) => parseAccountCode(`0xef0100${address.slice(2)}`)

// An authorization hands the account to its delegate. Only the verified Ambire deployment,
// on the chains where its code was checked, may pass.
describe('EIP-7702 delegate allowlist', () => {
  it.each([1n, 10n, 56n, 100n, 8453n, 42161n])('allows Ambire on chain %s', (chainId) => {
    expect(isAllowedDelegate(chainId, AMBIRE)).toBe(true)
    expect(isAllowedDelegate(chainId, AMBIRE.toLowerCase())).toBe(true)
  })

  it.each([
    ['an unverified chain', 137n, AMBIRE],
    ['the wildcard chain', 0n, AMBIRE],
    ['the zero address', 1n, '0x0000000000000000000000000000000000000000'],
    ['another contract', 1n, OTHER],
    ['a malformed address', 1n, '0x1234']
  ])('rejects %s', (_label, chainId, address) => {
    expect(isAllowedDelegate(chainId, address)).toBe(false)
  })

  it('matches only an Ambire delegation whose delegate code hash is the verified one', () => {
    expect(matchesDelegateCode(1n, delegatedTo(AMBIRE), AMBIRE_CODE_HASH)).toBe(true)
    expect(matchesDelegateCode(1n, delegatedTo(AMBIRE), `0x${AMBIRE_CODE_HASH.slice(2).toUpperCase()}`)).toBe(
      true
    )
    expect(matchesDelegateCode(1n, delegatedTo(AMBIRE), `0x${'00'.repeat(32)}`)).toBe(false)
    expect(matchesDelegateCode(137n, delegatedTo(AMBIRE), AMBIRE_CODE_HASH)).toBe(false)
    expect(matchesDelegateCode(1n, delegatedTo(OTHER), AMBIRE_CODE_HASH)).toBe(false)
    expect(matchesDelegateCode(1n, parseAccountCode('0x'), AMBIRE_CODE_HASH)).toBe(false)
    expect(matchesDelegateCode(1n, parseAccountCode('0x6000'), AMBIRE_CODE_HASH)).toBe(false)
    expect(matchesDelegateCode(1n, undefined, AMBIRE_CODE_HASH)).toBe(false)
  })
})
