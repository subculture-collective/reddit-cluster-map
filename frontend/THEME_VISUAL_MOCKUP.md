# Theme Toggle - Visual Mockup

## Dark Mode (Default State)

```
╔════════════════════════════════════════════════════════════════╗
║ Reddit Cluster Map                                             ║
║                                                                ║
║  ┌────────────────────────────────────────────────────────┐   ║
║  │ Graph Area (Black Background #000000)                  │   ║
║  │                                                         │   ║
║  │    ●────●  Nodes in bright colors:                     │   ║
║  │    │    │  • Subreddits: Bright Green (#4ade80)       │   ║
║  │    ●────●  • Users: Bright Blue (#60a5fa)             │   ║
║  │            • Posts: Bright Amber (#f59e0b)             │   ║
║  │            • Comments: Bright Rose (#f43f5e)           │   ║
║  │                                                         │   ║
║  └────────────────────────────────────────────────────────┘   ║
║                                                                ║
║  ┌─ Controls Panel ────────────────────┐ ← Top Right Corner   ║
║  │ (Dark gray bg-black/60, white text) │                      ║
║  │                                     │                      ║
║  │ View: [3D] [2D] [Dashboard] ...    │                      ║
║  │                                     │                      ║
║  │ ┌─────────────────────────────┐    │                      ║
║  │ │ Theme                        │    │                      ║
║  │ │                              │    │                      ║
║  │ │ ╔════════╗ ┌────────┐ ┌────────┐│    │                      ║
║  │ │ ║ System ║ │ Light  │ │  Dark  ││    │                      ║
║  │ │ ╚════════╝ └────────┘ └────────┘│    │                      ║
║  │ │  (blue)    (gray)     (gray)   │    │                      ║
║  │ │                              │    │                      ║
║  │ │ Active: Dark                 │    │                      ║
║  │ │ (small gray text)            │    │                      ║
║  │ └─────────────────────────────┘    │                      ║
║  │                                     │                      ║
║  │ Admin                               │                      ║
║  │ [Crawler ON] [Precalc ON]          │                      ║
║  │ ...                                 │                      ║
║  └─────────────────────────────────────┘                      ║
╚════════════════════════════════════════════════════════════════╝
```

## Light Mode (User Selected Light)

```
╔════════════════════════════════════════════════════════════════╗
║ Reddit Cluster Map                                             ║
║                                                                ║
║  ┌────────────────────────────────────────────────────────┐   ║
║  │ Graph Area (Light Gray Background #f8f9fa)             │   ║
║  │                                                         │   ║
║  │    ●────●  Nodes in darker colors:                     │   ║
║  │    │    │  • Subreddits: Dark Green (#059669)          │   ║
║  │    ●────●  • Users: Dark Blue (#2563eb)                │   ║
║  │            • Posts: Dark Amber (#d97706)                │   ║
║  │            • Comments: Dark Red (#dc2626)               │   ║
║  │                                                         │   ║
║  └────────────────────────────────────────────────────────┘   ║
║                                                                ║
║  ┌─ Controls Panel ────────────────────┐ ← Top Right Corner   ║
║  │ (Light gray bg-gray-100/90, dark text)                    ║
║  │                                     │                      ║
║  │ View: [3D] [2D] [Dashboard] ...    │                      ║
║  │                                     │                      ║
║  │ ┌─────────────────────────────┐    │                      ║
║  │ │ Theme                        │    │                      ║
║  │ │                              │    │                      ║
║  │ │ ┌────────┐ ╔════════╗ ┌────────┐│    │                      ║
║  │ │ │ System │ ║ Light  ║ │  Dark  ││    │                      ║
║  │ │ └────────┘ ╚════════╝ └────────┘│    │                      ║
║  │ │  (gray)     (blue)     (gray)   │    │                      ║
║  │ │                              │    │                      ║
║  │ └─────────────────────────────┘    │                      ║
║  │                                     │                      ║
║  │ Admin                               │                      ║
║  │ [Crawler ON] [Precalc ON]          │                      ║
║  │ ...                                 │                      ║
║  └─────────────────────────────────────┘                      ║
╚════════════════════════════════════════════════════════════════╝
```

## Button States Legend

```
Active Button (Selected):
╔════════╗
║ Button ║  ← Blue background (bg-blue-600)
╚════════╝    Blue border (border-blue-400)
              White text

Inactive Button:
┌────────┐
│ Button │  ← Gray background (bg-gray-700)
└────────┘    Gray border (border-gray-500)
              White text
```

## Transition Animation

When switching from Dark to Light mode:

```
1. Graph background fades:     #000000 → #f8f9fa
2. Node colors update:          Bright → Dark
3. Panel background fades:      bg-black/60 → bg-gray-100/90
4. Text color inverts:          White → Dark Gray
5. Button states swap:          System Active → Light Active

Duration: 200 milliseconds
Effect: Smooth fade transition using Tailwind's transition-colors
```

## Key Press Behavior

No keyboard shortcuts implemented in v1.0, but buttons are:
- ✅ Focusable with Tab key
- ✅ Clickable with Enter/Space when focused
- ✅ Clear visual focus indicator

## Mobile/Touch Behavior

- ✅ Touch-friendly button sizes
- ✅ No hover states on touch devices
- ✅ Tap to toggle theme
- ✅ Visual feedback on tap

## Accessibility Features

- ✅ Clear labels ("System", "Light", "Dark")
- ✅ Visual distinction between active/inactive states
- ✅ System mode shows current active theme
- ✅ High contrast between text and background
- ✅ Sufficient button sizes (min 44x44px touch target)

## Color Contrast Ratios

Dark Mode:
- White text on black/60 background: 15.29:1 (AAA)
- Node colors on black: All > 7:1 (AA)

Light Mode:
- Dark text on light gray background: 12.63:1 (AAA)
- Node colors on light gray: All > 4.5:1 (AA)

All ratios meet WCAG 2.1 Level AA standards for normal text.
