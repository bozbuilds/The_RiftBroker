import { useSuiClient } from '@mysten/dapp-kit'
import { SealClient } from '@mysten/seal'
import { Transaction } from '@mysten/sui/transactions'
import { useCallback, useMemo, useState } from 'react'

import { PACKAGE_ID } from '../lib/constants'
import { intelPayloadSchema, type IntelPayload } from '../lib/intel-schemas'
import { decryptIntel } from '../lib/seal'
import { downloadBlob } from '../lib/walrus'

interface DecryptState {
  status: 'idle' | 'downloading' | 'decrypting' | 'done' | 'error'
  data: IntelPayload | null
  error: string | null
}

export function useDecrypt() {
  const suiClient = useSuiClient()
  const [state, setState] = useState<DecryptState>({
    status: 'idle',
    data: null,
    error: null,
  })

  // TODO(Phase 4): Replace empty serverConfigs with real testnet key server configs
  const sealClient = useMemo(
    () => new SealClient({ suiClient, serverConfigs: [], verifyKeyServers: false }),
    [suiClient],
  )

  const decrypt = useCallback(async (params: {
    walrusBlobId: Uint8Array
    receiptId: string
    listingId: string
    sessionKey: unknown
  }) => {
    setState({ status: 'downloading', data: null, error: null })

    try {
      // 1. Download encrypted blob from Walrus
      const blobIdStr = new TextDecoder().decode(params.walrusBlobId)
      const encryptedData = await downloadBlob(blobIdStr)

      setState((s) => ({ ...s, status: 'decrypting' }))

      // 2. Build seal_approve tx (simulation only, never executed on-chain)
      // id = listing address hex → raw 32 bytes (matches BCS encoding in Move)
      const tx = new Transaction()
      const hexStr = params.listingId.replace(/^0x/, '')
      const innerIdBytes = Array.from(
        hexStr.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)),
      )
      tx.moveCall({
        target: `${PACKAGE_ID}::marketplace::seal_approve`,
        arguments: [
          tx.pure.vector('u8', innerIdBytes),
          tx.object(params.receiptId),
        ],
      })
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      })

      // 3. Decrypt via Seal
      const plaintext = await decryptIntel({
        sealClient,
        sessionKey: params.sessionKey as never,
        txBytes,
        encryptedData,
      })

      // 4. Parse and validate
      const json = JSON.parse(new TextDecoder().decode(plaintext))
      const parsed = intelPayloadSchema.safeParse(json)

      if (!parsed.success)
        throw new Error('Decrypted data failed validation')

      setState({ status: 'done', data: parsed.data, error: null })
      return parsed.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed'
      setState({ status: 'error', data: null, error: msg })
      throw err
    }
  }, [suiClient, sealClient])

  return { ...state, decrypt }
}
