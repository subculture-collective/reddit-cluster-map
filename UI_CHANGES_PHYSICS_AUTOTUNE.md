# UI Changes - Physics Auto-Tune Toggle

## Location
The auto-tune toggle is located in the Controls panel (top-right corner of the graph view), in the Physics section.

## Visual Description

```
┌─────────────────────────────────────────────────────┐
│ Controls Panel                                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ... (other controls above) ...                      │
│                                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│ Physics                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│                                                      │
│ ☑ Auto-tune physics (scales with node count)        │
│                                                      │
│ Repulsion         [──────●───────────]    -220      │
│                                                      │
│ Link dist         [──────●───────────]     120      │
│                                                      │
│ Damping           [──────●───────────]    0.88      │
│                                                      │
│ Cooldown          [──────●───────────]      80      │
│                                                      │
│ Collision         [──────●───────────]     3.0      │
│                                                      │
│ ... (other controls below) ...                      │
└─────────────────────────────────────────────────────┘
```

## Behavior

### When Auto-tune is ENABLED (☑ checked) - DEFAULT
- Charge strength automatically scales: `baseCharge × √(1000 / nodeCount)`
- Cooldown automatically scales: `max(200, nodeCount / 100)`
- User can still adjust the base values with sliders
- The slider values represent the base values that will be scaled

Example with 10,000 nodes:
- User sets Repulsion slider to -220
- Effective charge used: -220 × √(1000/10000) = -220 × 0.316 ≈ -69.5
- User sets Cooldown slider to 80
- Effective cooldown used: max(200, 10000/100) = 200 ticks

### When Auto-tune is DISABLED (☐ unchecked)
- Slider values are used exactly as shown
- No scaling applied
- Full manual control for users who want to fine-tune physics

## Styling
- Checkbox: Standard browser checkbox with blue accent color
- Label text: White text on dark background
- Helper text: "(scales with node count)" in reduced opacity (60%)
- Font size: Small (text-sm)
- Spacing: 2-unit gap between checkbox and label

## Default State
- **Checked** (enabled) by default for better stability with large graphs
- Recommended setting for most users
- Users can disable if they prefer manual control

## Technical Details

### State Management
```typescript
// In App.tsx
const [physics, setPhysics] = useState<{
  chargeStrength: number;
  linkDistance: number;
  velocityDecay: number;
  cooldownTicks: number;
  collisionRadius: number;
  autoTune?: boolean;
}>({
  chargeStrength: -220,
  linkDistance: 120,
  velocityDecay: 0.88,
  cooldownTicks: 80,
  collisionRadius: 3,
  autoTune: true, // Default enabled
});
```

### Toggle Handler
```typescript
// In Controls.tsx
<input
  type="checkbox"
  checked={!!physics.autoTune}
  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
    onPhysicsChange({
      ...physics,
      autoTune: e.target.checked,
    })
  }
/>
```

## User Guidance

### When to Enable Auto-tune (Default)
✅ Working with large graphs (10k+ nodes)
✅ Experiencing node instability or oscillation
✅ Want automatic optimal physics parameters
✅ Not sure what physics values to use

### When to Disable Auto-tune
- Expert user who knows exact physics values needed
- Working with very specific/custom graph types
- Prefer full manual control over all parameters
- Debugging or testing specific physics behaviors

## Impact on Existing Users

**Existing users will see:**
1. New checkbox labeled "Auto-tune physics" above the physics sliders
2. Default state: ENABLED (checked)
3. Immediate benefit: More stable graphs, especially for large datasets
4. Can disable at any time to restore full manual control
5. No breaking changes - all manual controls still work

**Migration:**
- No action required
- Auto-tune applies automatically
- Previous physics preferences preserved in sliders
- Users can toggle off to restore exact previous behavior
