import { Common, Mainnet, createCustomCommon, getPresetChainConfig } from '@ethereumjs/common'

function chainConfig(chain: number, hardfork: string) {
  const chainId = BigInt(chain)
  const preset = getPresetChainConfig(chain)

  return BigInt(preset.chainId) === chainId
    ? new Common({ chain: preset, hardfork })
    : createCustomCommon({ chainId: chain }, Mainnet, { hardfork })
}

export default chainConfig
