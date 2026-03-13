import { describe, expect, test } from 'vitest'
import { sceneToCanvas, nebulaRadius } from './nebula-texture'

describe('sceneToCanvas', () => {
  test('origin maps to canvas center', () => {
    const { px, py } = sceneToCanvas(0, 0, 512)
    expect(px).toBe(256)
    expect(py).toBe(256)
  })

  test('bottom-left corner (-50,-50) maps to (0,0)', () => {
    const { px, py } = sceneToCanvas(-50, -50, 512)
    expect(px).toBe(0)
    expect(py).toBe(0)
  })

  test('top-right corner (+50,+50) maps to (canvasSize, canvasSize)', () => {
    const { px, py } = sceneToCanvas(50, 50, 512)
    expect(px).toBe(512)
    expect(py).toBe(512)
  })

  test('custom sceneRange respected', () => {
    // sceneRange=100, point at (0,0) -> center
    const { px, py } = sceneToCanvas(0, 0, 512, 100)
    expect(px).toBe(256)
    expect(py).toBe(256)
  })

  test('x and z map independently', () => {
    const { px, py } = sceneToCanvas(-50, 50, 512)
    expect(px).toBe(0)
    expect(py).toBe(512)
  })
})

describe('nebulaRadius', () => {
  test('scales linearly with listingCount', () => {
    const r1 = nebulaRadius(1, 512)
    const r5 = nebulaRadius(5, 512)
    const scale = 512 * 0.015
    expect(r5 - r1).toBeCloseTo(4 * scale, 5)
  })

  test('base radius is canvas * 0.03', () => {
    const r0 = nebulaRadius(0, 512)
    expect(r0).toBeCloseTo(512 * 0.03, 5)
  })

  test('scales with canvasSize', () => {
    const r256 = nebulaRadius(1, 256)
    const r512 = nebulaRadius(1, 512)
    expect(r512).toBeCloseTo(r256 * 2, 5)
  })
})
