import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { GalaxyDataProvider } from './GalaxyDataProvider'

const queryClient = new QueryClient()

const { networkConfig } = createNetworkConfig({
  testnet: { url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' },
  mainnet: { url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider>
          <GalaxyDataProvider>
            {children}
          </GalaxyDataProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  )
}
