---
date: 2026-03-13
topic: intel-nebula-heat-visualization
---

# Intel Nebula — Amorphous Glow Heat Visualization

## What We're Building

Replace the discrete SystemDot spheres/rings and RegionZone wireframes with an amorphous
nebula glow that intensifies where more intel exists. No geometric markers visible at rest.
Hover anywhere inside a glowing region to see its tooltip; click to open region listings.

The filter bar (ALL / RESOURCE / FLEET / BASE / ROUTE) drives both the visual nebula and
the tooltip counts. Switching to "Fleet" re-renders with only Fleet-colored glow blobs and
tooltip counts matching Fleet-only listings per region.

## Why This Approach

The previous approach (spheres + wireframes) had several problems:
- Spheres revealed exact system locations that are supposed to be obfuscated
- Wireframes were hard to see and click, especially 2-system line hulls
- Dense clusters produced overlapping balls and unreadable labels
- The visual language didn't communicate "encrypted intel exists here"

An amorphous glow communicates presence without revealing location specifics, and naturally
communicates density (brighter = more intel) — a true heat map.

## Chosen Approach: Canvas Texture (Approach B)

Single large plane on the XZ galactic plane. JS generates a canvas texture with each
listing drawn as a `createRadialGradient` blob, composited with `globalCompositeOperation:
'screen'`. Applied as a `map` to a `MeshBasicMaterial`. Regenerated on filter change.

**Pros:**
- True amorphous shape (blobs merge into organic cloud)
- Single draw call regardless of system count
- Full control over exact appearance (color, falloff, blur)

**Cons:**
- Canvas texture regeneration on filter change (fast for 15 points, but adds a cycle)
- Less compatible with Bloom (texture is pre-composited)

## Alternative Approaches (Documented for Pivot)

### Approach A: Additive Sprites

Each active system gets a large `<mesh><planeGeometry>` flat on the XZ plane with a
canvas-generated radial gradient texture and `blending: AdditiveBlending`. Overlapping
sprites accumulate brightness naturally.

**Pros:** No custom GLSL, filter changes just swap which sprites render, Bloom naturally
amplifies dense areas, sprite scale encodes listing count.

**Cons:** 15 separate draw calls (fine at scale), glow shape is always circular, not
truly amorphous. Would need instancing above ~100 systems.

**Best when:** You want Bloom-compatible glow with minimal code.

### Approach C: Custom ShaderMaterial (Gaussian Sum)

Full-scene XZ plane with a fragment shader computing `sum(exp(-d²/r²))` over all
active systems. True volumetric fog effect, single GPU draw call.

**Pros:** Most physically accurate, scales to thousands of points.

**Cons:** Requires GLSL — significantly more complex, harder to maintain.

**Best when:** You need thousands of data points or true volumetric accuracy.

## Key Decisions

- Glow primitive: Canvas-generated texture on a scene plane
- Interaction target: Invisible RegionZone fill (reuses existing hit geometry)
- Filter → visual: Re-render canvas from `heatMap.systems` (filtered)
- Filter → tooltip: Separate `filteredRegionData` memo in App.tsx
- Density encoding: Gradient radius × listingCount, screen-composited overlap
- System names: Never revealed on map (obfuscated until decrypted)

## Open Questions

- Exact gradient falloff curve (linear vs Gaussian)
- Whether canvas texture resolution should scale with viewport
- Whether to add a subtle animated shimmer (prefers-reduced-motion gated)

## Next Steps

→ `/workflows:plan` for implementation details
