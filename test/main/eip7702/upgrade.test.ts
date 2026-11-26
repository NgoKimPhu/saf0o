import {
  confirmEip7702Upgrade,
  EIP7702_UPGRADE_GAS_LIMIT,
  eip7702TargetReached,
  inspectEip7702UpgradePreflight,
  signTrezorEip7702Upgrade,
  trezorUpgradeDelegate
} from '../../../main/eip7702/upgrade'
import { createEip7702UpgradeRequest } from '../../../main/transaction/eip7702'
import { parseAccountCode } from '../../../resources/domain/account/code'

const AUTHORITY = '0x1111111111111111111111111111111111111111'
const AMBIRE = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'
const preflight = (authorityCode: string, pendingNonce = '0x3') => ({
  authorityCode,
  latestNonce: '0x3',
  pendingNonce
})

describe('EIP-7702 dash upgrade', () => {
  // The firmware whitelists Ambire only on these chains; elsewhere the dash must not offer it.
  it.each([
    [1n, true],
    [100n, true],
    [8453n, true],
    [42161n, true],
    [10n, false],
    [56n, false],
    [137n, false]
  ])('offers the Trezor upgrade on chain %s: %s', (chainId, offered) => {
    expect(trezorUpgradeDelegate(chainId)?.address === AMBIRE).toBe(offered)
  })

  // A codeless account is the only valid start; an already-delegated or contract account is not.
  it('accepts only a codeless account with a stable nonce', () => {
    expect(inspectEip7702UpgradePreflight(AUTHORITY, preflight('0x'))).toMatchObject({
      authority: AUTHORITY,
      delegate: '0x0000000000000000000000000000000000000000',
      latestNonce: '0x3'
    })
    expect(() => inspectEip7702UpgradePreflight(AUTHORITY, preflight(`0xef0100${'2'.repeat(40)}`))).toThrow()
    expect(() => inspectEip7702UpgradePreflight(AUTHORITY, preflight('0x6000'))).toThrow()
    expect(() => inspectEip7702UpgradePreflight(AUTHORITY, preflight('0x', '0x4'))).toThrow(/stable/)
  })

  it('counts an upgrade as done only when the account delegates to the requested delegate', () => {
    const delegated = parseAccountCode(`0xef0100${AMBIRE.slice(2).toLowerCase()}`)
    expect(eip7702TargetReached(delegated, AMBIRE)).toBe(true)
    expect(eip7702TargetReached(parseAccountCode('0x'), AMBIRE)).toBe(false)
    expect(eip7702TargetReached(parseAccountCode(`0xef0100${'9'.repeat(40)}`), AMBIRE)).toBe(false)
    expect(eip7702TargetReached(parseAccountCode('0x'))).toBe(true)
    expect(eip7702TargetReached(delegated)).toBe(false)
  })

  // The native dialog is the user's consent: it must name the delegate and say the delegation persists.
  it('asks through the native dialog with the delegate named, and stops on cancel', async () => {
    const confirm = jest.fn().mockResolvedValue(true)
    await confirmEip7702Upgrade(8453, confirm)
    const [message, detail, label] = confirm.mock.calls[0]
    expect(message).toMatch(/Ambire smart account/)
    expect(detail).toContain(AMBIRE)
    expect(detail).toMatch(/stays until you revoke it/)
    expect(label).toBe('Upgrade account')

    await expect(confirmEip7702Upgrade(8453, jest.fn().mockResolvedValue(false))).rejects.toThrow(/cancelled/)
  })

  it('never asks on a chain where the Trezor cannot sign the upgrade', async () => {
    const confirm = jest.fn()
    await expect(confirmEip7702Upgrade(10, confirm)).rejects.toThrow()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('signs only through a ready Trezor that holds the authority', async () => {
    const request = createEip7702UpgradeRequest({
      authority: AUTHORITY,
      chainId: 1n,
      nonce: 3n,
      gasLimit: EIP7702_UPGRADE_GAS_LIMIT,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      delegate: AMBIRE,
      data: '0x'
    })
    const signEip7702Authorization = jest.fn()
    const signer = { type: 'seed', status: 'ok', addresses: [AUTHORITY], signEip7702Authorization }

    await expect(signTrezorEip7702Upgrade(signer, 0, request)).rejects.toThrow(/Trezor/)
    await expect(
      signTrezorEip7702Upgrade({ ...signer, type: 'trezor', status: 'locked' }, 0, request)
    ).rejects.toThrow(/ready/)
    expect(signEip7702Authorization).not.toHaveBeenCalled()
  })
})
