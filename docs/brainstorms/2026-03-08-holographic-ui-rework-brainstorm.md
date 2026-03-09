# Holographic UI Rework — Brainstorm

**Date:** 2026-03-08
**Status:** Decided, ready for planning

## What We're Building

A full visual rework of the Dark Net intel marketplace UI, transforming it from a flat 2D SVG heat map with basic dark theme into an immersive holographic tactical console with a 3D interactive star map.

### Inspiration

- **ef-map.com** — WebGL 3D star map with 24K+ systems, rotation/zoom, deep space aesthetic
- **everouter.com** — Clean routing UI with Material Design polish

The goal: combine the spatial immersion of ef-map with a unique holographic grid aesthetic that fits the "Dark Net" intelligence-trading brand.

## Why This Approach

The current UI is functional but visually flat. For a hackathon submission, visual impact matters. The holographic grid direction:

1. **Differentiates** from ef-map's nebula style — we're not cloning, we're creating a tactical HUD
2. **Reinforces the brand** — "The Dark Net" should feel like a covert intelligence terminal
3. **Supports the obfuscation model** — region boundary zones naturally show intel density without pinpointing systems
4. **Adds interactivity** without changing data flow — all changes are cosmetic/presentational

## Key Decisions

### 1. Map: Full 3D with Three.js (via React Three Fiber)

- True 3D scene with orbital camera controls (rotate, zoom)
- React Three Fiber (R3F) + @react-three/drei for declarative 3D in React
- Desktop-first — touch controls deferred (OrbitControls has native touch support if needed later)

### 2. Aesthetic: Holographic Grid

- **Background**: Near-black (#0a0e17) with faint cyan grid lines fading to edges
- **Star field**: Sparse bright pinpoints at varying depths
- **Grid plane**: Subtle perspective grid at z=0 with scale feedback on zoom
- **Region zones**: Neon wireframe boundaries with color-coded fill glow matching intel type. Edge pulse animation on active intel.
- **System dots**: Bright nodes on the grid with holographic label popups
- **Camera**: Orbit controls with smooth damping, snap-to angles optional

### 3. Region Intel Display: Glowing Boundary Zones

- Each of the 6 regions gets a soft glowing boundary area
- Glow intensity tied to intel density (listing count)
- Color reflects dominant intel type in the region
- Clicking a region zone opens a slide-in side panel with all region listings
- Individual system dots still visible within regions but don't reveal which system has the intel

### 4. App Layout: Map as Persistent Backdrop

- The 3D star map stays visible behind all views (dimmed/blurred when panels are open)
- Browse, My Intel, Create panels float over the map
- Always-in-space feel — no jarring tab switches to blank pages
- Navigation switches which floating panel is active

### 5. Chrome: Full Holographic Restyle

- Header, nav tabs, buttons all get neon/grid aesthetic
- Cyan/green accent borders, subtle glow effects on hover
- Monospace or tech font for UI labels
- Cards and panels have semi-transparent dark backgrounds with neon border accents
- Consistent with the HUD/tactical console feel throughout

### 6. Library Choice: React Three Fiber

- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — OrbitControls, Stars, Grid, Text, Billboard helpers
- `@react-three/postprocessing` — Bloom/glow effects (optional, can use CSS for panel glow)
- Keeps React component model — 3D nodes are JSX, state drives the scene

## Current State → Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Map rendering | 2D SVG, 1000x1000 viewBox | 3D Three.js scene, orbital camera |
| System display | Colored dots with CSS glow | 3D sprite nodes on grid plane |
| Region display | Text labels at centroids | Neon wireframe boundary zones with fill glow |
| Intel density | Dot size + pulse animation | Region glow intensity + color |
| Interactivity | Click system → expand | Click region zone → slide-in panel |
| Background | Flat dark color | 3D star field + perspective grid |
| Navigation | Full-page tab switches | Floating panels over persistent 3D backdrop |
| Chrome styling | Basic dark theme | Holographic HUD with neon accents |
| Mobile | Responsive CSS | Desktop-first (mobile deferred) |

## Resolved Questions

### 7. Typography: Orbitron + JetBrains Mono

- **Orbitron Bold** — geometric futuristic display font for headers, nav tabs, section titles
- **JetBrains Mono** — clean monospace for body text, data, addresses
- Both free on Google Fonts

### 8. Region Boundary Shapes: Convex Hull Wireframe

- Compute convex hull of each region's system positions
- Render as neon wireframe polygon on the grid plane
- Soft color-coded fill glow inside the hull
- Organic, data-driven shapes that adapt to system layout

### 9. Performance: Optimize Once, No Toggle

- Target reasonable baseline: 1000-2000 star particles, selective bloom
- No quality toggle — keep it simple for hackathon scope
- Test on dev machine, ship if it runs well

### 10. Glow: Three.js Bloom + CSS Glow (Split Approach)

- **3D scene** (via @react-three/postprocessing Bloom): region wireframe edges, active system nodes, grid lines
- **UI panels** (via CSS): box-shadow on hover for buttons/cards, border-glow, subtle text-shadow on headers
- Split keeps UI text sharp while 3D elements get cinematic bloom

## Scope Notes

- **No new data sources** — all visualization uses existing listing data
- **No contract changes** — purely frontend cosmetic
- **Existing tests unaffected** — lib/ and hook tests don't touch rendering
- **Component tests may need updates** if component interfaces change
- **Bundle size impact** — Three.js + R3F adds ~200-300KB gzipped. Acceptable for a hackathon demo.
