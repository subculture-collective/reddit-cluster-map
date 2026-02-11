# Visualization Modes

This document describes the different visualization modes available in the Reddit Cluster Map frontend.

## Overview

The application now supports three distinct visualization modes:

1. **3D Graph View** - Interactive 3D force-directed graph
2. **2D Graph View** - Interactive 2D force-directed graph  
3. **Dashboard View** - Statistical overview and analytics

## 3D Graph View

The 3D visualization supports two rendering modes: an optimized InstancedMesh renderer and the original react-force-graph-3d renderer.

### Features:
- 3D force-directed layout with WebGL rendering
- Camera controls (rotate, zoom, pan)
- **Navigation Minimap** - Overview map with current viewport indicator
- Node sizing based on configurable metrics
- Always-on labels for important nodes
- Link visibility optimization based on camera distance
- Node hover tooltips
- Click to select and focus nodes

### Rendering Modes:

#### InstancedMesh Renderer (Opt-in via `VITE_USE_INSTANCED_RENDERER`)
When enabled, uses THREE.js InstancedMesh for dramatically improved performance:
- Renders 100k+ nodes efficiently using GPU instancing
- Position updates in <5ms
- Memory usage <500MB for 100k nodes
- Automatic level-of-detail based on camera distance
- **Physics stabilization features** (see below)

##### Physics Stabilization in InstancedMesh Renderer
The InstancedMesh renderer includes advanced stability features:
- **Velocity Clamping**: Caps at 50 units/frame to prevent runaway acceleration
- **Position Bounds**: Constrains nodes within ±10,000 units from origin
- **Convergence Detection**: Auto-stops when velocities drop below 0.1
- **Auto-Tune Mode** (enabled by default):
  - Charge scales as: `baseCharge × √(1000 / nodeCount)`
  - Cooldown scales as: `max(200, nodeCount / 100)`
  - Example: 100k nodes with -220 charge → -69.5 effective charge
- **Manual Override**: Disable auto-tune to use slider values directly

##### Physics Controls (InstancedMesh Renderer)
- **Auto-tune physics** - Toggle automatic parameter scaling
- **Repulsion** - Charge strength (-400 to 0)
- **Link dist** - Distance between connected nodes (10 to 200)
- **Damping** - Velocity decay (0.7 to 0.99)
- **Cooldown** - Simulation iterations (0 to 400)
- **Collision** - Overlap prevention radius (0 to 20)

#### Original Renderer (Default)
Uses react-force-graph-3d library:
- Proven stability across browsers
- Standard D3 force simulation
- Good performance up to ~10k nodes

### Navigation Minimap

Both 3D renderers include an interactive minimap overlay for navigation context.

#### Features:
- **Small 200×200px canvas** in the bottom-right corner
- **Community visualization** - Shows community clusters as colored dots at their centroids
- **Viewport indicator** - Semi-transparent rectangle showing current camera position
- **Click to navigate** - Click anywhere on the minimap to smoothly move the camera to that location
- **Drag viewport** - Drag the viewport indicator to pan the camera
- **Toggle visibility** - Press **M** key to show/hide the minimap
- **Performance optimized** - Updates at 5Hz (200ms) to minimize overhead

#### How to Use:
1. The minimap appears automatically in the bottom-right corner when viewing 3D graphs
2. Click on any area of the minimap to jump the camera to that position
3. Drag the white viewport rectangle to pan smoothly
4. Press **M** to toggle minimap visibility (useful when inspecting the bottom-right area)
5. The minimap will not toggle when typing in input fields

#### Technical Details:
- Renders community cluster centroids as colored dots
- Shows individual nodes (sampled) when community detection is not active
- Camera position tracked every second and reflected in the viewport indicator
- Throttled rendering ensures minimal performance impact (<2% FPS)
- Works with both original and InstancedMesh renderers

### Best For:
- Exploring spatial relationships
- Understanding overall network structure
- Identifying clusters and communities
- Large-scale graph visualization (10k+ nodes with InstancedMesh)
- Quick navigation to different areas of large graphs
- Impressive visual presentations

## 2D Graph View

A new D3.js-based 2D visualization that mirrors the 3D functionality.

### Features:
- D3 force simulation with configurable physics
- **Drag nodes** - Click and drag any node to reposition it
- **Zoom & Pan** - Mouse wheel to zoom, drag background to pan
- **Interactive selection** - Click nodes to select and view details
- Same color scheme as 3D (subreddits=green, users=blue, posts=orange, comments=red)
- Node sizing based on same metrics as 3D
- Optional always-on labels for top nodes
- Smooth focus animations when searching
- SVG-based rendering for crisp visuals at any zoom level

### Technical Implementation:
- Uses D3.js v7 force simulation
- Forces applied:
  - `forceLink` - Maintains link distances
  - `forceManyBody` - Node repulsion (charge)
  - `forceCenter` - Keeps graph centered
  - `forceCollide` - Prevents node overlap
- Configurable velocity decay for damping
- All physics parameters controllable via UI

**Note**: The 2D view uses standard D3 force simulation. Physics stabilization features (velocity clamping, position bounds, auto-tune) are currently only available in the 3D InstancedMesh renderer.

### Best For:
- Detailed analysis and exploration
- Manual graph manipulation
- Better performance on lower-end devices
- Easier node selection and interaction
- Print/export friendly

## Dashboard View

A comprehensive statistics and analytics dashboard.

### Metrics Displayed:

#### Overview Cards:
- **Total Nodes** - Count of all entities in the graph
- **Total Links** - Count of all connections
- **Average Degree** - Average connections per node
- **Max Degree** - Highest connection count

#### Nodes by Type:
Visual breakdown showing counts for:
- Subreddits (green)
- Users (blue)
- Posts (orange)
- Comments (red)

#### Top Nodes by Connections:
Lists the 20 most connected nodes across all types with:
- Node name
- Node type
- Connection count
- Click to focus in graph view

#### Top Subreddits:
Shows 15 most popular subreddits by:
- Subscriber count (if available)
- Active user count (calculated from graph data)
- Click to focus in graph view

#### Most Active Users:
Lists 15 most active users showing:
- Total activity (posts + comments)
- Breakdown (posts / comments)
- Click to focus in graph view

#### Graph Metrics:
- **Graph Density** - Ratio of actual edges to possible edges
- **Average Clustering** - Normalized measure of local connectivity
- **Nodes per Type** - Percentage breakdown by entity type

### Features:
- One-click navigation to graph views with focused nodes
- Refresh button to reload latest data
- Responsive layout adapting to screen size
- Clean, dark theme matching graph views

### Best For:
- Quick overview of network statistics
- Identifying key entities
- Understanding network composition
- Finding interesting nodes to explore
- Presenting summary information

## Switching Between Modes

### From Graph Views:
- Use the **View** dropdown in the top-right controls panel
- Click **Dashboard** button to open dashboard

### From Dashboard:
- Use **View 3D Graph** or **View 2D Graph** buttons in the header
- Clicking any entity in the dashboard auto-navigates to graph view with that node focused

## Shared Features

All visualization modes share:
- Same data source (backend `/api/graph` endpoint)
- Same color coding for node types
- Respect for node type filters
- Consistent metric calculations
- Integration with Inspector panel (graph views only)

### Keyboard Shortcuts

The 3D graph views support the following keyboard shortcuts:

- **M** - Toggle minimap visibility
- **Ctrl+K** or **/** - Focus search bar
- **Ctrl+Shift+P** - Toggle Performance HUD (development mode)

## Performance Considerations

### 3D View:
- Hardware accelerated (WebGL)
- Better for large graphs (10K+ nodes)
- Higher GPU usage
- Automatic link hiding at distance

### 2D View:
- CPU-based rendering
- Better for detailed inspection
- Lower GPU usage
- All links always visible

### Dashboard:
- Minimal rendering overhead
- Can handle analysis of very large datasets
- Calculations performed once on load

## Future Enhancements

Potential additional visualization modes:

1. **Hierarchical Tree View** - Show parent-child relationships
2. **Timeline View** - Temporal analysis of activity
3. **Matrix/Heatmap** - Connection strength between entities
4. **Community Detection** - Automated cluster identification
5. **Table View** - Searchable, sortable data grid
6. **Comparison View** - Side-by-side metric comparison
