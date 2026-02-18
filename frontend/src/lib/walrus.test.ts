import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadBlob, downloadBlob } from './walrus'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

describe('uploadBlob', () => {
  it('uploads data and returns blobId from newlyCreated response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        newlyCreated: { blobObject: { blobId: 'abc123' } },
      }),
    })

    const data = new Uint8Array([1, 2, 3])
    const blobId = await uploadBlob(data)

    expect(blobId).toBe('abc123')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toContain('/v1/blobs')
    expect(opts.method).toBe('PUT')
    expect(new Uint8Array(opts.body as ArrayBuffer)).toEqual(data)
  })

  it('returns blobId from alreadyCertified response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        alreadyCertified: { blobId: 'existing456' },
      }),
    })

    const blobId = await uploadBlob(new Uint8Array([4, 5, 6]))
    expect(blobId).toBe('existing456')
  })

  it('throws on upload failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(uploadBlob(new Uint8Array([1]))).rejects.toThrow()
  })
})

describe('downloadBlob', () => {
  it('downloads blob by id', async () => {
    const payload = new Uint8Array([10, 20, 30])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => payload.buffer,
    })

    const result = await downloadBlob('abc123')

    expect(result).toEqual(payload)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0]!
    expect(url).toContain('abc123')
  })

  it('throws on download failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(downloadBlob('nonexistent')).rejects.toThrow()
  })
})
