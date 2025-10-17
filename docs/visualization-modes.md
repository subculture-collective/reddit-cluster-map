# Visualization Modes

This document describes the different visualization modes available in the Reddit Cluster Map frontend.

## Overview

The application now supports three distinct visualization modes:

1. **3D Graph View** - Interactive 3D force-directed graph
2. **2D Graph View** - Interactive 2D force-directed graph  
3. **Dashboard View** - Statistical overview and analytics

## 3D Graph View

The original 3D visualization using `react-force-graph-3d`.

### Features:
- 3D force-directed layout with WebGL rendering
- Camera controls (rotate, zoom, pan)
- Node sizing based on configurable metrics
- Always-on labels for important nodes
- Link visibility optimization based on camera distance
- Node hover tooltips
- Click to select and focus nodes

### Best For:
- Exploring spatial relationships
- Understanding overall network structure
- Identifying clusters and communities
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
