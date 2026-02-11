# Accessibility Features

This document describes the WCAG 2.1 AA accessibility features implemented in the Reddit Cluster Map application.

## Overview

The Reddit Cluster Map application is designed to be accessible to users with disabilities, meeting WCAG 2.1 Level AA standards. While the 3D/2D graph visualization itself is inherently visual and relies on WebGL, all UI controls and navigation elements are fully accessible.

## Key Features

### 1. Skip to Main Content

A skip link is provided at the top of the page (visible on keyboard focus) that allows keyboard users to bypass navigation and jump directly to the main content area.

**Location:** index.html  
**Activation:** Tab key on page load, then Enter

### 2. Keyboard Navigation

All interactive elements are accessible via keyboard:

- **Tab** / **Shift+Tab**: Navigate between interactive elements
- **Enter** / **Space**: Activate buttons and controls
- **Arrow keys**: Navigate within lists and menus
- **Escape**: Close dialogs and panels
- **Ctrl+B** / **Cmd+B**: Toggle sidebar
- **Ctrl+K** / **/** : Focus search bar
- **?**: Show keyboard shortcuts help

See [KEYBOARD_SHORTCUTS.md](./KEYBOARD_SHORTCUTS.md) for complete keyboard shortcut documentation.

### 3. Focus Indicators

All interactive elements display visible focus indicators with high contrast:

- Focus ring color: Blue (#3b82f6) in light mode, Lighter blue (#60a5fa) in dark mode
- Focus ring width: 3px (4px in high contrast mode)
- Focus offset: 2px for clear visibility

### 4. High Contrast Mode

A high contrast mode toggle is available in the Controls panel:

**Features:**
- Increased contrast for all text and UI elements
- Brighter node colors for better visibility
- Thicker focus indicators (4px)
- Enhanced border visibility on all controls

**Activation:** Controls panel → Theme section → High contrast mode checkbox

### 5. ARIA Labels and Landmarks

All components use semantic HTML and ARIA attributes:

#### Landmarks
- `<main>` for main content area
- `<aside>` for sidebar controls
- `<nav>` for tab navigation in Inspector
- `role="region"` for Legend and other non-semantic sections

#### ARIA Attributes
- `aria-label`: Descriptive labels for icon-only buttons and controls
- `aria-labelledby`: Associates headings with their sections
- `aria-describedby`: Provides additional context for complex controls
- `aria-live`: Announces dynamic content changes to screen readers
- `aria-expanded`: Indicates collapsible section state
- `aria-pressed`: Indicates toggle button state
- `aria-selected`: Indicates selected tab in tab panels
- `aria-controls`: Associates controls with their target regions

### 6. Screen Reader Support

#### Live Regions
- Status announcements for state changes
- Search result updates
- Loading states
- Error messages

#### Semantic Structure
- Proper heading hierarchy
- List semantics for navigation and legends
- Table semantics for data displays
- Dialog and modal ARIA patterns

#### Icon Handling
Decorative icons (emojis) are marked with `aria-hidden="true"` and accompanied by descriptive text.

### 7. Color Contrast

All text meets WCAG AA contrast requirements:

- **Normal text:** Minimum 4.5:1 contrast ratio
- **Large text (18pt+):** Minimum 3:1 contrast ratio
- **UI components:** Minimum 3:1 contrast ratio

Color is never the only means of conveying information; shape, position, and text labels are always provided.

### 8. Form Controls

All form inputs have:
- Associated `<label>` elements
- Clear placeholder text
- Error messages linked with `aria-describedby`
- Range sliders include `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext`

## Component-Specific Accessibility

### SearchBar
- Combobox pattern with autocomplete
- Keyboard navigation (Arrow Up/Down, Enter, Escape)
- Clear button with descriptive label
- Loading state announcement
- No results message

### Sidebar
- Collapsible with keyboard shortcut (Ctrl+B)
- Touch gestures for mobile (swipe up/down)
- All sections have proper headings
- Toggle buttons indicate state with `aria-pressed`
- Range sliders announce current values

### Inspector
- Tab panel pattern with proper ARIA
- Keyboard navigation between tabs
- Loading spinner with status role
- Close button with descriptive label
- Connection list with virtual scrolling

### Legend
- Region landmark with label
- List semantics for node types
- Color indicators supplemented with text
- Community count display

### KeyboardShortcutsHelp
- Modal dialog pattern
- Focus trap within dialog
- Escape key to close
- Grouped by category

## Testing

### Automated Testing

We use `axe-core` for automated accessibility testing:

```bash
npm run test -- accessibility.test.tsx
```

This runs tests that verify:
- No WCAG violations
- Proper ARIA attributes
- Correct landmark structure
- Focus management

### Manual Testing Checklist

- [ ] All interactive elements focusable with keyboard
- [ ] Focus order is logical and matches visual layout
- [ ] No keyboard traps
- [ ] Focus indicators visible on all elements
- [ ] Screen reader announces all important changes
- [ ] High contrast mode increases visibility
- [ ] Color contrast meets AA standards
- [ ] Forms can be completed with keyboard only
- [ ] Error messages are associated with fields
- [ ] Skip link works correctly

### Screen Reader Testing

Tested with:
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (macOS/iOS)
- TalkBack (Android)

## Known Limitations

### WebGL Graph Visualization

The 3D and 2D graph visualizations are inherently visual and rely on WebGL/Canvas rendering, which has limited accessibility support:

- **Node inspection:** While nodes can be selected via search, direct interaction with the graph requires mouse/touch input
- **Spatial relationships:** The spatial layout of nodes is not conveyed to screen readers
- **Alternative access:** All graph data is accessible through:
  - Search bar with autocomplete
  - Inspector panel with node details
  - Dashboard view with statistics
  - Communities view with community listings

### Recommendations for Non-Visual Access

Users who cannot interact with the visual graph should use:

1. **Search Bar** to find specific nodes
2. **Inspector Panel** to view node details and connections
3. **Dashboard View** for overall statistics
4. **Communities View** for community-based navigation

## Future Improvements

- [ ] Sonification of graph data (audio representation)
- [ ] Detailed text descriptions of graph structure
- [ ] Accessible data tables as alternative view
- [ ] Enhanced keyboard navigation within graph (arrow keys to traverse connections)
- [ ] ARIA treegrid pattern for hierarchical navigation

## Reporting Accessibility Issues

If you encounter any accessibility barriers, please report them:

1. Open an issue on GitHub with the "accessibility" label
2. Provide details about:
   - The component or feature
   - Your assistive technology (screen reader, keyboard-only, etc.)
   - Steps to reproduce
   - Expected vs. actual behavior

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
