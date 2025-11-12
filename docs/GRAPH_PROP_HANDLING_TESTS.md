# Graph Component Prop Handling Test Documentation

This document describes the expected behavior for prop handling in both Graph2D and Graph3D components to ensure parity.

## Test Cases for `usePrecomputedLayout` Prop

### Test 1: Layout Badge Display - Precomputed Enabled with Positions
**Setup:**
- `usePrecomputedLayout={true}`
- Backend returns nodes with x, y, z coordinates (>70% of nodes)

**Expected Behavior:**
- Badge displays: "Layout: Precomputed"
- Badge style: Green background (`bg-emerald-700/70 text-emerald-100`)
- Tooltip: "Using precomputed node positions from backend"
- Graph3D: `cooldownTime` is set to 0
- Graph2D: `alphaDecay` is set to 0.15, initial `alpha` is 0.15
- Graph should render with minimal simulation movement

**Verified in:**
- Graph3D.tsx lines 666-682, 747-766, 811
- Graph2D.tsx lines 413-424, 514-516, 707-709, 809-828

---

### Test 2: Layout Badge Display - Precomputed Enabled without Positions
**Setup:**
- `usePrecomputedLayout={true}`
- Backend returns nodes WITHOUT x, y, z coordinates (<70% of nodes)

**Expected Behavior:**
- Badge displays: "Layout: Simulated"
- Badge style: Gray background (`bg-slate-700/70 text-slate-100`)
- Tooltip: "Precomputed layout enabled, but this dataset has no stored positions"
- Graph3D: `cooldownTime` is undefined (uses default)
- Graph2D: Normal simulation with `alpha` of 1.0 and default `alphaDecay`
- Graph should simulate normally from random positions

**Verified in:**
- Graph3D.tsx lines 666-682, 747-766, 811
- Graph2D.tsx lines 413-424, 514-516, 707-712, 809-828

---

### Test 3: Layout Badge Display - Precomputed Disabled
**Setup:**
- `usePrecomputedLayout={false}`

**Expected Behavior:**
- Badge displays: "Layout: Simulated"
- Badge style: Gray background (`bg-slate-700/70 text-slate-100`)
- Tooltip: "Using client-side simulation"
- Backend is NOT requested with `with_positions=true` parameter
- Both graphs use normal simulation regardless of what backend returns
- Graph3D: `cooldownTime` is undefined
- Graph2D: Normal simulation with `alpha` of 1.0

**Verified in:**
- Graph3D.tsx lines 365, 666-682, 747-766, 811
- Graph2D.tsx lines 274, 413-424, 514-516, 707-712, 809-828

---

### Test 4: API Request Behavior
**Setup:**
- Test with `usePrecomputedLayout={true}` and `usePrecomputedLayout={false}`

**Expected Behavior:**

When `usePrecomputedLayout={true}`:
- API request includes: `?max_nodes=20000&max_links=50000&with_positions=true&types=...`

When `usePrecomputedLayout={false}`:
- API request includes: `?max_nodes=20000&max_links=50000&types=...`
- No `with_positions` parameter

**Verified in:**
- Graph3D.tsx lines 360-368
- Graph2D.tsx lines 269-277

---

### Test 5: Position Data Preservation
**Setup:**
- `usePrecomputedLayout={true}`
- Backend returns nodes with coordinates

**Expected Behavior:**
- Graph2D: Node x, y coordinates are preserved in D3 simulation (line 488)
- Graph3D: Node x, y, z coordinates are passed directly to ForceGraph3D component
- D3 simulation in Graph2D respects initial positions and settles quickly
- ForceGraph3D in Graph3D uses positions directly with cooldownTime=0

**Verified in:**
- Graph3D.tsx lines 769-772 (graphData prop), 811 (cooldownTime)
- Graph2D.tsx line 488 (node cloning preserves x/y), lines 514-516, 629-654 (view fitting)

---

### Test 6: Physics Tuning Parity
**Setup:**
- Compare physics behavior between 2D and 3D with precomputed positions

**Expected Behavior:**

Both components should minimize simulation when precomputed positions exist:

**Graph3D:**
- Sets `cooldownTime={hasPrecomputedPositions ? 0 : undefined}`
- This immediately stops the simulation after initialization
- Relies on ForceGraph3D's built-in position handling

**Graph2D:**
- Sets `simulation.alphaDecay(0.15)` (higher than default ~0.0228)
- Starts with `simulation.alpha(0.15)` (lower than default 1.0)
- This causes the simulation to settle in ~10-20 ticks instead of ~300
- Fits the view to the precomputed layout bounds

Both approaches achieve the goal: minimal drift from precomputed positions.

**Verified in:**
- Graph3D.tsx line 811
- Graph2D.tsx lines 514-516, 707-712

---

### Test 7: Badge Consistency Between Components
**Setup:**
- Toggle between 2D and 3D modes with same `usePrecomputedLayout` value

**Expected Behavior:**
- Badge text, styling, and tooltip should be identical in both modes
- Badge should maintain state when switching between 2D/3D
- Badge logic is identical: `usePrecomputedLayout && hasPrecomputedPositions`

**Verified in:**
- Graph3D.tsx lines 747-766
- Graph2D.tsx lines 809-828
- Code is byte-for-byte identical

---

## Manual Testing Checklist

To manually verify the implementation:

1. [ ] Start the application with precomputed layout enabled (default)
2. [ ] Load a graph with precomputed positions
3. [ ] Verify badge shows "Layout: Precomputed" in green
4. [ ] Verify graph renders with minimal movement
5. [ ] Toggle precomputed layout off in Controls
6. [ ] Verify badge changes to "Layout: Simulated" in gray
7. [ ] Verify graph re-simulates from current positions
8. [ ] Switch between 2D and 3D modes
9. [ ] Verify badge text and styling match in both modes
10. [ ] Test with a dataset without precomputed positions
11. [ ] Verify badge shows "Simulated" even with precomputed layout enabled
12. [ ] Verify tooltip messages are helpful and accurate

---

## Implementation Notes

### Detection Logic
Both components use the same detection logic for `hasPrecomputedPositions`:
```typescript
const hasPrecomputedPositions = useMemo(() => {
  if (!usePrecomputedLayout) return false;
  const n = filtered.nodes.length;
  if (n === 0) return false;
  let withPos = 0;
  for (const node of filtered.nodes) {
    if (typeof node.x === "number" && typeof node.y === "number" && 
        (typeof node.z === "number" || true)) { // 2D only checks x,y
      withPos++;
    }
  }
  return withPos / n > 0.7; // 70% threshold
}, [filtered, usePrecomputedLayout]);
```

### Physics Configuration
Default physics props from App.tsx:
```typescript
{
  chargeStrength: -220,
  linkDistance: 120,
  velocityDecay: 0.88,
  cooldownTicks: 80,
  collisionRadius: 3,
}
```

These are applied consistently in both Graph2D and Graph3D, with the precomputed layout tuning applied on top when appropriate.
