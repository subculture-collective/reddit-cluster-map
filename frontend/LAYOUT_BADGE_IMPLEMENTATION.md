# Layout Badge Implementation Summary

## Overview
Both Graph2D and Graph3D components display a consistent "Layout: Precomputed/Simulated" badge that indicates whether the graph is using precomputed positions from the backend or client-side force simulation.

## Badge States

### State 1: Precomputed Layout Active
**When:** `usePrecomputedLayout={true}` AND backend provides positions for >70% of nodes

**Visual:**
```
┌──────────────────────────────────────────┐
│ [Reload] [✓] Only show linked nodes      │
│ Layout: Precomputed                       │ ← Green badge
└──────────────────────────────────────────┘
```

**Styling:**
- Background: `bg-emerald-700/70` (emerald with 70% opacity)
- Text: `text-emerald-100` (light emerald)
- Border: `border-emerald-500/40` (emerald border with 40% opacity)
- Shape: Rounded pill (`rounded-full`)
- Padding: `px-2 py-0.5`
- Font: `text-xs font-medium`

**Tooltip:** "Using precomputed node positions from backend"

**Behavior:**
- Graph3D: Sets `cooldownTime={0}` to immediately stop simulation
- Graph2D: Uses `alphaDecay(0.15)` and `alpha(0.15)` for quick settling

---

### State 2: Simulated Layout (Precomputed Disabled)
**When:** `usePrecomputedLayout={false}`

**Visual:**
```
┌──────────────────────────────────────────┐
│ [Reload] [✓] Only show linked nodes      │
│ Layout: Simulated                         │ ← Gray badge
└──────────────────────────────────────────┘
```

**Styling:**
- Background: `bg-slate-700/70` (slate with 70% opacity)
- Text: `text-slate-100` (light slate)
- Border: `border-slate-500/40` (slate border with 40% opacity)
- Shape: Rounded pill (`rounded-full`)
- Padding: `px-2 py-0.5`
- Font: `text-xs font-medium`

**Tooltip:** "Using client-side simulation"

**Behavior:**
- Graph3D: Uses default simulation with `cooldownTime={undefined}`
- Graph2D: Uses standard D3 force simulation with `alpha(1.0)`

---

### State 3: Simulated Layout (No Positions Available)
**When:** `usePrecomputedLayout={true}` BUT backend provides positions for <70% of nodes

**Visual:**
```
┌──────────────────────────────────────────┐
│ [Reload] [✓] Only show linked nodes      │
│ Layout: Simulated                         │ ← Gray badge
└──────────────────────────────────────────┘
```

**Styling:** Same as State 2 (gray)

**Tooltip:** "Precomputed layout enabled, but this dataset has no stored positions"

**Behavior:** Falls back to client-side simulation like State 2

---

## Code Location

### Graph3D Badge (lines 747-766)
```tsx
<span
  title={
    usePrecomputedLayout
      ? hasPrecomputedPositions
        ? "Using precomputed node positions from backend"
        : "Precomputed layout enabled, but this dataset has no stored positions"
      : "Using client-side simulation"
  }
  className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
    usePrecomputedLayout && hasPrecomputedPositions
      ? "bg-emerald-700/70 text-emerald-100 border border-emerald-500/40"
      : "bg-slate-700/70 text-slate-100 border border-slate-500/40"
  }`}
>
  Layout:{" "}
  {usePrecomputedLayout && hasPrecomputedPositions
    ? "Precomputed"
    : "Simulated"}
</span>
```

### Graph2D Badge (lines 809-828)
Identical implementation to Graph3D.

## Badge Placement

The badge is located in the top-left control panel, appearing after the "Only show linked nodes" checkbox:

```
┌─────────────────────────────────────────────────────────┐
│ Top-left overlay (absolute positioning, z-index 10)    │
│                                                          │
│ [Reload Button] [Checkbox: Only show linked nodes]      │
│ Layout: Precomputed/Simulated                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

CSS classes on container:
- `absolute top-2 left-2 z-10`
- `bg-black/50 text-white rounded px-3 py-2 text-sm`
- `flex items-center gap-3`

## Implementation Details

### Detection Logic
```typescript
const hasPrecomputedPositions = useMemo(() => {
  if (!usePrecomputedLayout) return false;
  const n = filtered.nodes.length;
  if (n === 0) return false;
  let withPos = 0;
  for (const node of filtered.nodes) {
    if (
      typeof node.x === "number" &&
      typeof node.y === "number" &&
      typeof node.z === "number"  // Graph2D doesn't check z
    )
      withPos++;
  }
  return withPos / n > 0.7;  // 70% threshold
}, [filtered, usePrecomputedLayout]);
```

### API Request Behavior
When `usePrecomputedLayout={true}`:
```typescript
const params = new URLSearchParams({
  max_nodes: String(MAX_RENDER_NODES),
  max_links: String(MAX_RENDER_LINKS),
});
// Request precomputed positions only when enabled
if (usePrecomputedLayout) params.set("with_positions", "true");
```

### Physics Tuning

**Graph3D (ForceGraph3D):**
```tsx
<ForceGraph3D
  cooldownTicks={physics?.cooldownTicks ?? 1}
  cooldownTime={hasPrecomputedPositions ? 0 : undefined}
  warmupTicks={0}
  forceEngine="ngraph"
  ...
/>
```

**Graph2D (D3 Force):**
```typescript
// If most nodes already have positions, tune simulation to settle quickly
if (hasPrecomputedPositions) {
  // Increase alphaDecay so it cools faster and doesn't drift far from provided layout
  simulation.alphaDecay(0.15);
}

// Later in the code:
if (hasPrecomputedPositions) {
  // With precomputed positions, a gentle nudge is enough
  simulation.alpha(0.15).restart();
} else {
  simulation.alpha(1).restart();
}
```

## Parity Verification

### Visual Consistency ✅
- Badge text: Identical ("Precomputed" vs "Simulated")
- Badge styling: Identical CSS classes
- Badge placement: Identical location in control panel
- Tooltip text: Identical messages

### Functional Consistency ✅
- Detection logic: Same 70% threshold, same prop handling
- API requests: Both conditionally add `with_positions=true`
- Physics tuning: Both optimize for precomputed positions (different approaches for different libraries)

### State Management ✅
- Both use `usePrecomputedLayout` prop from App.tsx
- Both detect `hasPrecomputedPositions` with same logic
- Both persist `usePrecomputedLayout` to localStorage

## User Experience

1. User toggles "Use Precomputed Layout" in Controls panel
2. App.tsx updates `usePrecomputedLayout` state
3. State is persisted to localStorage
4. Graph components receive updated prop
5. Components request new data with/without `with_positions=true`
6. Badge updates to show current layout mode
7. Graph rendering adjusts physics accordingly

The badge provides immediate visual feedback about the layout source, helping users understand whether they're viewing a precalculated structure or a client-side simulation.
