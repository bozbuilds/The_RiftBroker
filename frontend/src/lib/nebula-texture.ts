export interface NebulaPoint {
  /** Scene-space X coordinate [-50, +50] */
  readonly x: number
  /** Scene-space Z coordinate [-50, +50] */
  readonly z: number
  /** Number of listings — drives gradient radius */
  readonly listingCount: number
  /** Neon hex color string */
  readonly color: string
}

/**
 * Map scene-space coordinates to canvas pixel coordinates.
 * Scene range [-sceneRange, +sceneRange] → canvas [0, canvasSize].
 */
export function sceneToCanvas(
  x: number,
  z: number,
  canvasSize: number,
  sceneRange: number = 50,
): { px: number; py: number } {
  const px = ((x + sceneRange) / (2 * sceneRange)) * canvasSize
  const py = ((z + sceneRange) / (2 * sceneRange)) * canvasSize
  return { px, py }
}

/**
 * Gradient radius in canvas pixels for a given listing count.
 * Base radius + per-listing growth, both proportional to canvas size.
 */
export function nebulaRadius(listingCount: number, canvasSize: number): number {
  return canvasSize * 0.03 + listingCount * (canvasSize * 0.015)
}

/**
 * Draw intel nebula blobs onto a canvas using screen compositing.
 * Each point becomes a soft radial gradient; overlapping blobs merge organically.
 * Call canvas.texture.needsUpdate = true after this to push changes to Three.js.
 */
export function renderNebulaTexture(
  canvas: HTMLCanvasElement,
  points: readonly NebulaPoint[],
  sceneRange: number = 50,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (points.length === 0) return

  ctx.globalCompositeOperation = 'screen'

  for (const point of points) {
    const { px, py } = sceneToCanvas(point.x, point.z, canvas.width, sceneRange)
    const radius = nebulaRadius(point.listingCount, canvas.width)

    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
    gradient.addColorStop(0, hexToRgba(point.color, 0.55))
    gradient.addColorStop(0.4, hexToRgba(point.color, 0.25))
    gradient.addColorStop(1, hexToRgba(point.color, 0))

    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }

  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over'
}

/** Convert a #rrggbb hex color to rgba(r,g,b,a) string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
