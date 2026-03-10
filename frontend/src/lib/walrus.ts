const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space'
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space'

export async function uploadBlob(
  data: Uint8Array,
  epochs = 3,
): Promise<string> {
  // Slice to exact bounds in case Uint8Array is a view over a larger ArrayBuffer
  const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const res = await fetch(
    `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`,
    { method: 'PUT', body },
  )

  if (!res.ok)
    throw new Error(`Walrus upload failed: ${res.status} ${res.statusText}`)

  const json = await res.json()
  const blobId = json.newlyCreated?.blobObject?.blobId
    ?? json.alreadyCertified?.blobId

  if (!blobId)
    throw new Error('Walrus upload returned no blobId')

  return blobId
}

export async function downloadBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(
    `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`,
  )

  if (!res.ok) {
    if (res.status === 404)
      throw new Error('Blob not found — testnet data expires after a few epochs. Re-run the seed script to refresh.')
    throw new Error(`Walrus download failed: ${res.status} ${res.statusText}`)
  }

  return new Uint8Array(await res.arrayBuffer())
}
