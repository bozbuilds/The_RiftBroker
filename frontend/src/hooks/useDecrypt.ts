import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit'
import { SealClient, SessionKey } from '@mysten/seal'
import { Transaction } from '@mysten/sui/transactions'
import { useCallback, useMemo, useState } from 'react'

import { PACKAGE_ID, SEAL_KEY_SERVERS } from '../lib/constants'
import { intelPayloadSchema, type IntelPayload } from '../lib/intel-schemas'
import { decryptIntel } from '../lib/seal'
import { downloadBlob } from '../lib/walrus'

interface DecryptState {
  status: 'idle' | 'signing' | 'downloading' | 'decrypting' | 'done' | 'error'
  data: IntelPayload | null
  error: string | null
}

export function useDecrypt() {
  const suiClient = useSuiClient()
  const account = useCurrentAccount()
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage()
  const [state, setState] = useState<DecryptState>({
    status: 'idle',
    data: null,
    error: null,
  })

  const sealClient = useMemo(
    () => new SealClient({ suiClient, serverConfigs: SEAL_KEY_SERVERS, verifyKeyServers: false }),
    [suiClient],
  )

  const decrypt = useCallback(async (params: {
    walrusBlobId: Uint8Array
    receiptId: string
    listingId: string
  }) => {
    if (!account) throw new Error('Wallet not connected')

    // 1. Create Seal session key (prompts wallet signature)
    setState({ status: 'signing', data: null, error: null })

    const sessionKey = await SessionKey.create({
      address: account.address,
      packageId: PACKAGE_ID,
      ttlMin: 10,
      suiClient,
    })
    const message = sessionKey.getPersonalMessage()
    const { signature } = await signPersonalMessage({ message })
    await sessionKey.setPersonalMessageSignature(signature)

    // 2. Download encrypted blob from Walrus
    setState((s) => ({ ...s, status: 'downloading' }))
    const blobIdStr = new TextDecoder().decode(params.walrusBlobId)
    const encryptedData = await downloadBlob(blobIdStr)

    // 3. Build seal_approve tx (simulation only, never executed on-chain)
    setState((s) => ({ ...s, status: 'decrypting' }))
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

    // 4. Decrypt via Seal
    const plaintext = await decryptIntel({
      sealClient,
      sessionKey: sessionKey as never,
      txBytes,
      encryptedData,
    })

    // 5. Parse and validate
    const json = JSON.parse(new TextDecoder().decode(plaintext))
    const parsed = intelPayloadSchema.safeParse(json)

    if (!parsed.success)
      throw new Error('Decrypted data failed validation')

    setState({ status: 'done', data: parsed.data, error: null })
    return parsed.data
  }, [suiClient, sealClient, account, signPersonalMessage])

  const decryptWithErrorHandling = useCallback(async (params: {
    walrusBlobId: Uint8Array
    receiptId: string
    listingId: string
  }) => {
    try {
      return await decrypt(params)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed'
      setState({ status: 'error', data: null, error: msg })
      throw err
    }
  }, [decrypt])

  return { ...state, decrypt: decryptWithErrorHandling }
}
