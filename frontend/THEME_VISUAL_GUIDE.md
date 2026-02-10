# Theme System - Visual Documentation

## Theme Toggle Location

The theme toggle is located in the **Controls panel** in the top-right corner of the application, in its own dedicated section labeled "Theme".

## UI Layout

```
┌─────────────────────────────────────┐
│ Controls Panel                      │
│ (Top-right corner)                  │
├─────────────────────────────────────┤
│ View: [3D] [2D] [Dashboard] ...     │
│                                     │
│ ┌─────────────────────────────┐   │
│ │ Theme                        │   │  ← New section
│ │ [System] [Light] [Dark]      │   │  ← Toggle buttons
│ │ Active: Dark                 │   │  ← System mode indicator
│ └─────────────────────────────┘   │
│                                     │
│ Admin                               │
│ [Crawler ON] [Precalc ON]          │
│ ...                                 │
└─────────────────────────────────────┘
```

## Button States

### System Mode (Default)
- **System** button: Blue background (`bg-blue-600`)
- **Light** button: Gray background (`bg-gray-700`)
- **Dark** button: Gray background (`bg-gray-700`)
- Shows: "Active: Dark" or "Active: Light" text below

### Light Mode
- **System** button: Gray background
- **Light** button: Blue background
- **Dark** button: Gray background
- No "Active" text shown

### Dark Mode
- **System** button: Gray background
- **Light** button: Gray background
- **Dark** button: Blue background
- No "Active" text shown

## Theme Colors

### Dark Theme (Default)
```
Graph Background:  #000000 (Pure Black)
Controls Panel:    bg-black/60 (Black with 60% opacity)
Text:              text-white (White)
Node Colors:
  - Subreddit:     #4ade80 (Bright Green)
  - User:          #60a5fa (Bright Blue)
  - Post:          #f59e0b (Bright Amber)
  - Comment:       #f43f5e (Bright Rose)
```

### Light Theme
```
Graph Background:  #f8f9fa (Light Gray)
Controls Panel:    bg-gray-100/90 (Light Gray with 90% opacity)
Text:              text-gray-900 (Dark Gray)
Node Colors:
  - Subreddit:     #059669 (Dark Green)
  - User:          #2563eb (Dark Blue)
  - Post:          #d97706 (Dark Amber)
  - Comment:       #dc2626 (Dark Red)
```

## Transition Effects

When switching themes:
1. **Graph background** fades from black to light gray (or vice versa)
2. **Node colors** update instantly
3. **Controls panel** background transitions smoothly
4. **Text colors** invert with smooth transition
5. Duration: 200ms (`transition-colors duration-200`)

## Implementation Details

### CSS Classes Used

**Root div** (App.tsx):
```tsx
<div className="w-full h-screen bg-white dark:bg-black transition-colors duration-200">
```

**Controls panel**:
```tsx
<div className="... bg-gray-100/90 dark:bg-black/60 text-gray-900 dark:text-white ...">
```

**Graph backgrounds**:
- Graph2D: `bg-white dark:bg-black`
- Graph3D: JavaScript prop `backgroundColor={theme === 'dark' ? '#000000' : '#f8f9fa'}`
- Graph3DInstanced: THREE.js Color object updated via useEffect

### LocalStorage Key
```javascript
localStorage.setItem('themeMode', 'light' | 'dark' | 'system');
```

### Media Query
```javascript
window.matchMedia('(prefers-color-scheme: dark)').matches
```

## User Flow

1. **First Visit**
   - Theme mode defaults to "system"
   - Detects OS theme preference
   - Applies corresponding theme

2. **Manual Override**
   - User clicks Light or Dark button
   - Theme changes immediately
   - Preference saved to localStorage

3. **Subsequent Visits**
   - Reads theme from localStorage
   - Applies saved preference
   - Ignores system preference if override set

4. **Return to System**
   - User clicks System button
   - Removes localStorage preference
   - Returns to OS theme tracking
   - Updates when OS theme changes

## Code Structure

```
frontend/src/
├── contexts/
│   └── ThemeContext.tsx       # Theme provider and hook
├── index.css                  # CSS custom properties
├── tailwind.config.js         # Dark mode config
├── main.tsx                   # ThemeProvider wrapper
└── components/
    ├── App.tsx                # Root theme classes
    ├── Controls.tsx           # Theme toggle UI
    ├── Graph3D.tsx            # Dynamic bg prop
    ├── Graph3DInstanced.tsx   # Scene bg update
    ├── Graph2D.tsx            # Theme classes
    └── CommunityMap.tsx       # Theme classes
```
