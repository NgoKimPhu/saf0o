export enum ApprovalType {
  OtherChainApproval = 'approveOtherChain',
  GasLimitApproval = 'approveGasLimit',
  SimulationApproval = 'approveSimulationOverride',
  TokenApprovalRisk = 'approveBroadTokenAuthority',
  TokenAllowanceChangeRisk = 'approveExistingTokenAllowanceChange',
  DelegatedAccountRisk = 'approveDelegatedAccountExecution',
  ProxyImplementationChangeRisk = 'approveProxyImplementationChange',
  TokenPermitRisk = 'approveUnlimitedTokenPermit',
  SignatureRisk = 'approveDangerousSignature',
  DappGuardrailWarning = 'approveDappGuardrailWarning',
  AccountUpgrade = 'approveAccountUpgrade'
}

export const SAF0O_REPOSITORY_URL = 'https://github.com/NgoKimPhu/saf0o'
export const SAF0O_LICENSE_URL = `${SAF0O_REPOSITORY_URL}/blob/main/LICENSE`
export const SAF0O_SUPPORT_URL = `${SAF0O_REPOSITORY_URL}/issues`
export const SAF0O_COMPANION_RELEASES_URL = 'https://github.com/NgoKimPhu/saf0o-companion/releases'
// Saf0o Companion is not in the stores; the upstream Wren listings speak a different protocol.
export const SAF0O_COMPANION_CHROME_WEB_STORE_URL = SAF0O_COMPANION_RELEASES_URL
export const SAF0O_COMPANION_FIREFOX_ADDONS_URL = SAF0O_COMPANION_RELEASES_URL
export const LEDGER_SHOP_URL = 'https://shop.ledger.com/'
export const TREZOR_SHOP_URL = 'https://shop.trezor.io/'

const NETWORK_PRESETS = {
  ethereum: {
    default: {
      local: 'direct'
    },
    1: {
      publicnode: 'https://ethereum-rpc.publicnode.com'
    },
    10: {
      publicnode: 'https://optimism-rpc.publicnode.com'
    },
    137: {
      publicnode: 'https://polygon-bor-rpc.publicnode.com'
    },
    8453: {
      publicnode: 'https://base-rpc.publicnode.com'
    },
    42161: {
      publicnode: 'https://arbitrum-one-rpc.publicnode.com'
    },
    84532: {
      publicnode: 'https://base-sepolia-rpc.publicnode.com'
    },
    11155111: {
      publicnode: 'https://ethereum-sepolia-rpc.publicnode.com'
    },
    11155420: {
      publicnode: 'https://optimism-sepolia-rpc.publicnode.com'
    }
  }
}

const ADDRESS_DISPLAY_CHARS = 8
const NATIVE_CURRENCY = '0x0000000000000000000000000000000000000000'
const MAX_HEX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

export { NETWORK_PRESETS, ADDRESS_DISPLAY_CHARS, NATIVE_CURRENCY, MAX_HEX }
