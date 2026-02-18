import { describe, it, expect, vi } from 'vitest'
import { encryptIntel, decryptIntel } from './seal'

describe('encryptIntel', () => {
  it('calls sealClient.encrypt with listing id as hex string', async () => {
    const ciphertext = new Uint8Array([99, 99])
    const mockSealClient = {
      encrypt: vi.fn().mockResolvedValueOnce({ encryptedObject: ciphertext }),
    }
    const listingId = '0x' + 'ab'.repeat(32)

    const result = await encryptIntel({
      sealClient: mockSealClient as never,
      listingId,
      payload: new Uint8Array([1, 2, 3]),
    })

    expect(result).toBe(ciphertext)
    expect(mockSealClient.encrypt).toHaveBeenCalledOnce()
    const args = mockSealClient.encrypt.mock.calls[0]![0]
    expect(args.threshold).toBe(2)
    expect(args.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(args.id).toBe(listingId)
  })
})

describe('decryptIntel', () => {
  it('calls sealClient.decrypt and returns plaintext', async () => {
    const plaintext = new Uint8Array([1, 2, 3])
    const mockSealClient = {
      decrypt: vi.fn().mockResolvedValueOnce(plaintext),
    }
    const mockSessionKey = {} as never
    const txBytes = new Uint8Array([10, 20])
    const ciphertext = new Uint8Array([99, 99])

    const result = await decryptIntel({
      sealClient: mockSealClient as never,
      sessionKey: mockSessionKey,
      txBytes,
      encryptedData: ciphertext,
    })

    expect(result).toBe(plaintext)
    expect(mockSealClient.decrypt).toHaveBeenCalledWith({
      data: ciphertext,
      sessionKey: mockSessionKey,
      txBytes,
    })
  })
})
