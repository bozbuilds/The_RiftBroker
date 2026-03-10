import { describe, expect, it } from 'vitest'

import { sceneToSvg } from './HeatMap'

// ─── sceneToSvg ─────────────────────────────────────────────────────────────
// Maps galaxy scene-space [x, z] coords (range -50..+50) to SVG viewport px.
// Viewbox: 1000×1000, padding: 60 on each side → usable region: 880px

describe('sceneToSvg', () => {
  const V = 1000 // viewboxSize

  it('maps the origin to the center of the viewbox', () => {
    const { svgX, svgY } = sceneToSvg(0, 0, V)
    expect(svgX).toBeCloseTo(500)
    expect(svgY).toBeCloseTo(500)
  })

  it('maps (-50, -50) to the top-left padding boundary', () => {
    const { svgX, svgY } = sceneToSvg(-50, -50, V)
    expect(svgX).toBeCloseTo(60)
    expect(svgY).toBeCloseTo(60)
  })

  it('maps (50, 50) to the bottom-right padding boundary', () => {
    const { svgX, svgY } = sceneToSvg(50, 50, V)
    expect(svgX).toBeCloseTo(940)
    expect(svgY).toBeCloseTo(940)
  })

  it('is symmetric around the center', () => {
    const a = sceneToSvg(-30, -20, V)
    const b = sceneToSvg(30, 20, V)
    expect(a.svgX + b.svgX).toBeCloseTo(1000)
    expect(a.svgY + b.svgY).toBeCloseTo(1000)
  })

  it('maps x and z independently (orthogonal axes)', () => {
    const { svgX: x1 } = sceneToSvg(25, 0, V)
    const { svgX: x2 } = sceneToSvg(-25, 0, V)
    const { svgY: y1 } = sceneToSvg(0, 25, V)
    const { svgY: y2 } = sceneToSvg(0, -25, V)
    // 25 units from center should be same pixel offset in both axes
    expect(x1 - 500).toBeCloseTo(500 - x2)
    expect(y1 - 500).toBeCloseTo(500 - y2)
  })

  it('output stays within [padding, viewboxSize - padding]', () => {
    const padding = 60
    for (const coord of [-50, -25, 0, 25, 50]) {
      const { svgX, svgY } = sceneToSvg(coord, coord, V)
      expect(svgX).toBeGreaterThanOrEqual(padding)
      expect(svgX).toBeLessThanOrEqual(V - padding)
      expect(svgY).toBeGreaterThanOrEqual(padding)
      expect(svgY).toBeLessThanOrEqual(V - padding)
    }
  })

  it('respects a custom sceneRange', () => {
    // With sceneRange=100 and (100,100) → bottom-right boundary
    const { svgX, svgY } = sceneToSvg(100, 100, V, 100)
    expect(svgX).toBeCloseTo(940)
    expect(svgY).toBeCloseTo(940)
  })
})
