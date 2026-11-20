// EVM networks with a PublicNode RPC. Hostnames come from https://publicnode.com (see NOTES).
export interface PublicNodePreset {
  id: number
  name: string
  symbol: string
  nativeCurrencyName: string
  nativeCurrencyDecimals: number
  rpcUrl: string
  explorer: string
  isTestnet: boolean
}

export const publicNodePresets: readonly PublicNodePreset[] = [
  {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    isTestnet: false
  },
  {
    id: 10,
    name: 'OP Mainnet',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://optimism-rpc.publicnode.com',
    explorer: 'https://optimistic.etherscan.io',
    isTestnet: false
  },
  {
    id: 56,
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    nativeCurrencyName: 'BNB',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://bsc-rpc.publicnode.com',
    explorer: 'https://bscscan.com',
    isTestnet: false
  },
  {
    id: 100,
    name: 'Gnosis',
    symbol: 'XDAI',
    nativeCurrencyName: 'xDAI',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://gnosis-rpc.publicnode.com',
    explorer: 'https://gnosisscan.io',
    isTestnet: false
  },
  {
    id: 137,
    name: 'Polygon',
    symbol: 'POL',
    nativeCurrencyName: 'POL',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorer: 'https://polygonscan.com',
    isTestnet: false
  },
  {
    id: 146,
    name: 'Sonic',
    symbol: 'S',
    nativeCurrencyName: 'Sonic',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://sonic-rpc.publicnode.com',
    explorer: 'https://sonicscan.org',
    isTestnet: false
  },
  {
    id: 5000,
    name: 'Mantle',
    symbol: 'MNT',
    nativeCurrencyName: 'Mantle',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://mantle-rpc.publicnode.com',
    explorer: 'https://mantlescan.xyz',
    isTestnet: false
  },
  {
    id: 8453,
    name: 'Base',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://base-rpc.publicnode.com',
    explorer: 'https://basescan.org',
    isTestnet: false
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    explorer: 'https://arbiscan.io',
    isTestnet: false
  },
  {
    id: 42220,
    name: 'Celo',
    symbol: 'CELO',
    nativeCurrencyName: 'Celo',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://celo-rpc.publicnode.com',
    explorer: 'https://celoscan.io',
    isTestnet: false
  },
  {
    id: 43114,
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    nativeCurrencyName: 'Avalanche',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
    explorer: 'https://snowtrace.io',
    isTestnet: false
  },
  {
    id: 59144,
    name: 'Linea',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://linea-rpc.publicnode.com',
    explorer: 'https://lineascan.build',
    isTestnet: false
  },
  {
    id: 534352,
    name: 'Scroll',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://scroll-rpc.publicnode.com',
    explorer: 'https://scrollscan.com',
    isTestnet: false
  },
  {
    id: 130,
    name: 'Unichain',
    symbol: 'ETH',
    nativeCurrencyName: 'Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://unichain-rpc.publicnode.com',
    explorer: 'https://uniscan.xyz',
    isTestnet: false
  },
  {
    id: 97,
    name: 'BNB Smart Chain Testnet',
    symbol: 'tBNB',
    nativeCurrencyName: 'tBNB',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
    explorer: 'https://testnet.bscscan.com',
    isTestnet: true
  },
  {
    id: 10200,
    name: 'Gnosis Chiado',
    symbol: 'XDAI',
    nativeCurrencyName: 'xDAI',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://gnosis-chiado-rpc.publicnode.com',
    explorer: 'https://gnosis-chiado.blockscout.com',
    isTestnet: true
  },
  {
    id: 59141,
    name: 'Linea Sepolia',
    symbol: 'ETH',
    nativeCurrencyName: 'Sepolia Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://linea-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.lineascan.build',
    isTestnet: true
  },
  {
    id: 80002,
    name: 'Polygon Amoy',
    symbol: 'POL',
    nativeCurrencyName: 'POL',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
    explorer: 'https://amoy.polygonscan.com',
    isTestnet: true
  },
  {
    id: 84532,
    name: 'Base Sepolia',
    symbol: 'ETH',
    nativeCurrencyName: 'Sepolia Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://base-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.basescan.org',
    isTestnet: true
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    symbol: 'ETH',
    nativeCurrencyName: 'Sepolia Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://arbitrum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.arbiscan.io',
    isTestnet: true
  },
  {
    id: 11155111,
    name: 'Sepolia',
    symbol: 'ETH',
    nativeCurrencyName: 'Sepolia Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true
  },
  {
    id: 11155420,
    name: 'OP Sepolia',
    symbol: 'ETH',
    nativeCurrencyName: 'Sepolia Ether',
    nativeCurrencyDecimals: 18,
    rpcUrl: 'https://optimism-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia-optimism.etherscan.io',
    isTestnet: true
  }
]
