/**
 * Seed script — creates demo listings on SUI testnet.
 *
 * Usage:
 *   SUI_PRIVATE_KEY=<suiprivkey1...> pnpm seed
 *   # or set SUI_PRIVATE_KEY in frontend/.env.local
 *
 * Requires: deployed contract (PACKAGE_ID in constants.ts)
 */

import { config } from 'dotenv'
config({ path: '../.env' })
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { SealClient } from '@mysten/seal'

import { PACKAGE_ID, CLOCK_ID, SEAL_KEY_SERVERS } from '../lib/constants'
import { encryptIntel } from '../lib/seal'
import { uploadBlob } from '../lib/walrus'
import { SEED_LISTINGS } from './seed-data'

const RPC_URL = 'https://fullnode.testnet.sui.io:443'
const DELAY_MS = 2000

function getKeypair(): Ed25519Keypair {
  const key = process.env.SUI_PRIVATE_KEY
  if (!key) throw new Error('SUI_PRIVATE_KEY env var required')
  const { scheme, secretKey } = decodeSuiPrivateKey(key)
  if (scheme !== 'ED25519') throw new Error(`Unsupported key scheme: ${scheme}`)
  return Ed25519Keypair.fromSecretKey(secretKey)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const keypair = getKeypair()
  const address = keypair.getPublicKey().toSuiAddress()
  console.log(`Seeding with address: ${address}`)
  console.log(`Package ID: ${PACKAGE_ID}`)
  console.log(`Listings to create: ${SEED_LISTINGS.length}\n`)

  const suiClient = new SuiJsonRpcClient({ url: RPC_URL })
  const sealClient = new SealClient({
    suiClient: suiClient as never,
    serverConfigs: SEAL_KEY_SERVERS,
    verifyKeyServers: false,
  })

  let created = 0
  let failed = 0

  for (let i = 0; i < SEED_LISTINGS.length; i++) {
    const listing = SEED_LISTINGS[i]
    const label = `[${i + 1}/${SEED_LISTINGS.length}] type=${listing.intelType} system=${listing.systemId}`

    try {
      console.log(`${label} — Creating listing...`)

      // Step 1: Create listing with empty blob_id
      const { Transaction } = await import('@mysten/sui/transactions')
      const createTx = new Transaction()
      const [stakeCoin] = createTx.splitCoins(createTx.gas, [createTx.pure.u64(listing.stakeAmount)])
      createTx.moveCall({
        target: `${PACKAGE_ID}::marketplace::create_listing`,
        arguments: [
          createTx.pure.u8(listing.intelType),
          createTx.pure.u64(listing.systemId),
          createTx.pure.u64(listing.price),
          createTx.pure.u64(listing.decayHours),
          createTx.pure.vector('u8', []),
          stakeCoin,
          createTx.object(CLOCK_ID),
        ],
      })

      const createResult = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: createTx,
      })
      await suiClient.waitForTransaction({ digest: createResult.digest })

      // Extract listing object ID
      const txDetails = await suiClient.getTransactionBlock({
        digest: createResult.digest,
        options: { showObjectChanges: true },
      })
      const createdObj = txDetails.objectChanges?.find(
        (c) => c.type === 'created' && 'objectType' in c
          && c.objectType.includes('IntelListing'),
      )
      if (!createdObj || !('objectId' in createdObj))
        throw new Error('Could not find created listing in tx output')

      const listingId = createdObj.objectId
      console.log(`  Listing created: ${listingId}`)

      // Step 2: Encrypt payload with Seal
      console.log('  Encrypting payload...')
      const payloadBytes = new TextEncoder().encode(JSON.stringify(listing.payload))
      const ciphertext = await encryptIntel({
        sealClient,
        listingId,
        payload: payloadBytes,
      })

      // Step 3: Upload to Walrus
      console.log('  Uploading to Walrus...')
      const blobId = await uploadBlob(ciphertext)
      console.log(`  Blob uploaded: ${blobId}`)

      // Step 4: Set blob_id on listing
      console.log('  Setting blob ID...')
      const setBlobTx = new Transaction()
      setBlobTx.moveCall({
        target: `${PACKAGE_ID}::marketplace::set_walrus_blob_id`,
        arguments: [
          setBlobTx.object(listingId),
          setBlobTx.pure.vector('u8', Array.from(new TextEncoder().encode(blobId))),
        ],
      })
      await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: setBlobTx,
      })

      created++
      console.log(`  Done.\n`)
    } catch (err) {
      failed++
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}\n`)
    }

    if (i < SEED_LISTINGS.length - 1)
      await sleep(DELAY_MS)
  }

  console.log(`\nSeed complete: ${created} created, ${failed} failed`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
