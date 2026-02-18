import type { SealClient, SessionKey } from '@mysten/seal'

import { PACKAGE_ID } from './constants'

export async function encryptIntel(params: {
  sealClient: SealClient
  listingId: string
  payload: Uint8Array
}): Promise<Uint8Array> {
  // listingId is a hex address string — Seal SDK hex-decodes it to 32 bytes,
  // which matches the BCS encoding of an address that seal_approve expects.
  const { encryptedObject } = await params.sealClient.encrypt({
    threshold: 2,
    packageId: PACKAGE_ID,
    id: params.listingId,
    data: params.payload,
  })

  return encryptedObject
}

export async function decryptIntel(params: {
  sealClient: SealClient
  sessionKey: SessionKey
  txBytes: Uint8Array
  encryptedData: Uint8Array
}): Promise<Uint8Array> {
  return params.sealClient.decrypt({
    data: params.encryptedData,
    sessionKey: params.sessionKey,
    txBytes: params.txBytes,
  })
}
