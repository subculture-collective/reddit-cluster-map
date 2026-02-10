# Keyboard Navigation and Shortcuts

This document describes the keyboard shortcuts available in the Reddit Cluster Map application.

## Available Shortcuts

### Search
- **Ctrl+K** or **/** — Focus search bar
  - Works even when typing in text fields
  - Press to quickly jump to search

### Navigation
- **Ctrl+B** — Toggle sidebar
  - Quickly hide/show the sidebar to maximize graph viewing area
- **Escape** — Deselect node / Close panels
  - Closes the keyboard shortcuts help overlay
  - Deselects currently selected node
  - Clears focus
- **Arrow Keys** (↑ ↓ ← →) — Navigate between connected nodes
  - When a node is selected, use arrow keys to jump to connected nodes
  - Finds the nearest neighbor in the direction pressed
  - *(Note: Full implementation pending)*

### View Controls
- **F** — Fit graph to screen *(pending)*
  - Automatically zoom and pan to show all visible nodes
- **R** — Reset camera *(pending)*
  - Return camera to default position and zoom level
- **1** — Switch to 3D view
- **2** — Switch to 2D view
- **3** — Switch to Community view
- **L** — Toggle labels
  - Show/hide node labels on the graph

### Help
- **?** or **F1** — Show keyboard shortcuts help
  - Displays an overlay with all available shortcuts
  - Press again or press Escape to close

## Implementation Details

### Hook: `useKeyboardShortcuts`

Located at `frontend/src/hooks/useKeyboardShortcuts.ts`

Features:
- Global keyboard event listener
- Automatic exclusion when typing in text inputs
- Special handling for search focus shortcuts (work even in text fields)
- Modifier key support (Ctrl, Alt, Shift, Meta)
- Clean event handling with proper cleanup

Usage:
```typescript
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

useKeyboardShortcuts({
  onFocusSearch: () => searchRef.current?.focus(),
  onToggleSidebar: () => setIsSidebarOpen(prev => !prev),
  onEscape: () => handleEscape(),
  // ... other actions
});
```

### Component: `KeyboardShortcutsHelp`

Located at `frontend/src/components/KeyboardShortcutsHelp.tsx`

Features:
- Modal overlay with categorized shortcuts
- Dark mode support
- Responsive design
- Accessible (ARIA labels, keyboard navigation)
- Backdrop blur effect for better visibility

### Integration

The shortcuts are integrated in `App.tsx`:
1. Import the hook and component
2. Create state for help overlay visibility
3. Connect shortcuts to app state setters
4. Render the help overlay component

## Testing

Unit tests are located at `frontend/src/hooks/useKeyboardShortcuts.test.ts`

Tests cover:
- All individual shortcuts
- Modifier key combinations
- Input field exclusion
- Special case for search focus shortcuts

Run tests:
```bash
npm run test -- src/hooks/useKeyboardShortcuts.test.ts
```

## Browser Compatibility

All shortcuts are designed to avoid conflicts with common browser shortcuts:
- Uses single letters without modifiers where safe
- Ctrl+K works alongside browser search
- F1 for help is a common pattern
- Escape for closing is standard

## Future Enhancements

Planned improvements:
1. **Fit graph (F) and Reset camera (R)**
   - Requires exposing methods from Graph3D/Graph2D components
   - Needs ref forwarding or imperative handle pattern

2. **Arrow key navigation between connected nodes**
   - Requires access to graph data and node positions
   - Find nearest neighbor in pressed direction
   - Update selection and focus state

3. **Customizable shortcuts**
   - Allow users to configure their own key bindings
   - Store preferences in localStorage

4. **Visual indicator for shortcuts**
   - Show shortcut hints on hover
   - Inline hints in UI elements
