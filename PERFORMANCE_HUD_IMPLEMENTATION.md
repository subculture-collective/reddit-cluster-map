# Performance HUD Implementation

## Overview

The Performance HUD component displays real-time rendering metrics in a compact overlay. It provides developers and power users with insights into the application's performance.

## Visual Appearance

The HUD appears as a semi-transparent black overlay in the top-left corner of the screen (below the main controls):

```
┌─────────────────────────┐
│ FPS: 60.0               │
│ Draw Calls: 4           │
│ Triangles: 12,543       │
│ Nodes: 1,234 / 5,678    │
│ GPU Mem: ~45.2 MB       │
│ Textures: 8             │
│ Geometries: 4           │
│ LOD: 2                  │
│ Simulation: active      │
└─────────────────────────┘
```

**Styling:**
- Background: Black with 80% opacity (`bg-black/80`)
- Text: Green monospace font (`text-green-400 font-mono`)
- Size: Extra small (`text-xs`)
- Position: Fixed at top-16 left-2
- Z-index: 50 (appears above most elements)

## Features

### Metrics Displayed

1. **FPS** - Frames per second (rolling 60-frame average)
2. **Draw Calls** - Number of draw calls per frame from THREE.WebGLRenderer
3. **Triangles** - Total triangles rendered
4. **Nodes** - Visible nodes / Total nodes in dataset
5. **GPU Mem** - Estimated GPU memory usage
6. **Textures** - Number of textures loaded
7. **Geometries** - Number of geometries in scene
8. **LOD** - Current level of detail tier (0-based)
9. **Simulation** - Physics simulation state (active/idle/precomputed)

### Keyboard Shortcuts

- **F12** - Toggle HUD visibility
- **Ctrl+Shift+P** - Alternate toggle shortcut

### Visibility Control

- **Default:** Hidden in production builds
- **Development:** Remembers last state in localStorage
- **Override:** Set `VITE_SHOW_PERFORMANCE_HUD=true` to show in production

### Performance Impact

- **Update Frequency:** 1Hz (once per second)
- **DOM Updates:** Direct manipulation (no React re-renders)
- **FPS Tracking:** requestAnimationFrame (minimal overhead)
- **Memory:** Keeps last 60 FPS samples (~480 bytes)
- **Measured Impact:** <1% FPS reduction

## Usage

The HUD is automatically integrated into both `Graph3D` and `Graph3DInstanced` components:

```tsx
<PerformanceHUD
    renderer={rendererRef.current}
    nodeCount={filtered.nodes.length}
    totalNodeCount={graphData?.nodes.length || 0}
    simulationState={usePrecomputedLayout ? 'precomputed' : 'active'}
    lodLevel={0}
/>
```

## Testing

All 10 unit tests pass:
- ✓ Renders without crashing
- ✓ Hidden by default in production
- ✓ Accepts all props without error
- ✓ Handles null renderer gracefully
- ✓ Handles different node counts
- ✓ Handles different simulation states
- ✓ Handles different LOD levels
- ✓ Uses proper styling
- ✓ Toggles with F12
- ✓ Toggles with Ctrl+Shift+P

## Implementation Details

### Direct DOM Manipulation

Instead of using React state for updates, the component uses direct DOM manipulation:

```typescript
// Update DOM directly to avoid React re-renders
containerRef.current.textContent = lines.join('\n');
```

This approach ensures the HUD itself doesn't impact rendering performance.

### FPS Calculation

FPS is calculated using a rolling average over the last 60 frames:

```typescript
const trackFPS = () => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    
    if (delta > 0) {
        const fps = 1000 / delta;
        fpsHistoryRef.current.push(fps);
        
        // Keep only last 60 frames
        if (fpsHistoryRef.current.length > 60) {
            fpsHistoryRef.current.shift();
        }
    }
    
    lastFrameTimeRef.current = now;
    rafIdRef.current = requestAnimationFrame(trackFPS);
};
```

### Memory Estimation

GPU memory is roughly estimated based on:
- Node count (~100 bytes per node)
- Texture count (~1MB per texture)

```typescript
const nodeMem = nodeCount * 100;
const texMem = textures * 1024 * 1024;
memoryEstimateMB = (nodeMem + texMem) / (1024 * 1024);
```

## Files Changed

1. **frontend/src/components/PerformanceHUD.tsx** - Main component (NEW)
2. **frontend/src/components/PerformanceHUD.test.tsx** - Test suite (NEW)
3. **frontend/src/components/Graph3D.tsx** - Integration point
4. **frontend/src/components/Graph3DInstanced.tsx** - Integration point

## Related Issues

- Addresses issue #145 (part of Epic #139, Roadmap #138)
- Implements Phase 1 of v2.0: Instrumentation & Foundation
