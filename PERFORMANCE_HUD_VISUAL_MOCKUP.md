# Performance HUD Visual Mockup

## In-App Appearance

Here's what the Performance HUD looks like when toggled on (press F12):

```
┌──────────────────────────────────────────────────────────────┐
│                    Reddit Cluster Map - 3D View               │
│                                                               │
│  ┌──────────────────────┐  ┌────────────────────┐           │
│  │ [Reload]             │  │ Performance HUD:    │  ◄─ Overlay
│  │ ☑ Only linked nodes  │  │  FPS: 60.0         │           │
│  │                      │  │  Draw Calls: 4     │           │
│  └──────────────────────┘  │  Triangles: 12,543 │           │
│                            │  Nodes: 1,234/5,678│           │
│                            │  GPU Mem: ~45.2 MB │           │
│                            │  Textures: 8       │           │
│                            │  Geometries: 4     │           │
│                            │  LOD: 2            │           │
│                            │  Simulation: active│           │
│                            └────────────────────┘           │
│                                                               │
│                     ● ● ● ●                                  │
│                  ●         ● ●                               │
│               ●                ●                              │
│             ●                    ●                            │
│          ●           ●             ●                          │
│        ●               ●             ●                        │
│      ●      ●            ●                                    │
│     ●         ●                 ●                             │
│   ●             ●                  ●                          │
│  ●                 ●                                          │
│                                                               │
└──────────────────────────────────────────────────────────────┘

   Press Ctrl+Shift+P to toggle Performance HUD
```

**Note:** F12 is intentionally not used to avoid blocking browser DevTools.

## Color Scheme

- **Background**: rgba(0, 0, 0, 0.8) - Semi-transparent black
- **Text**: #4ade80 - Green (Tailwind's green-400)
- **Font**: Monospace (system default)
- **Border**: Rounded corners (0.375rem)
- **Padding**: 0.5rem x 0.75rem

## Positioning

```
Screen Layout:
┌────────────────────────────────────┐
│ top: 4rem (64px)                   │  ← Offset to avoid main controls
│ left: 0.5rem (8px)                 │  ← Small margin from edge
│ z-index: 50                        │  ← Above most elements
│                                    │
│ ┌────────────────┐                │
│ │ Performance    │ ◄ HUD appears  │
│ │ metrics here   │    here        │
│ └────────────────┘                │
│                                    │
│         (Graph visualization       │
│          fills rest of screen)     │
│                                    │
└────────────────────────────────────┘
```

## State Indicators

The HUD shows different simulation states:

**Active (running physics simulation):**
```
┌──────────────────┐
│ Simulation: active│
└──────────────────┘
```

**Idle (physics converged):**
```
┌──────────────────┐
│ Simulation: idle  │
└──────────────────┘
```

**Precomputed (using backend positions):**
```
┌──────────────────────┐
│ Simulation: precomputed│
└──────────────────────┘
```

## Integration Points

The HUD is integrated into two components:

1. **Graph3D** - Original react-force-graph-3d implementation
2. **Graph3DInstanced** - High-performance InstancedMesh implementation

Both receive the same props and display identical metrics.
