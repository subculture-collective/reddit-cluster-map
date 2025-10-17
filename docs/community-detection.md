# Community Detection

This document explains the community detection feature in the Reddit Cluster Map application.

## Overview

Community detection is a graph analysis technique that identifies groups of nodes that are more densely connected to each other than to the rest of the network. This helps understand the natural clustering and organization within the Reddit data.

## Algorithms

### Louvain Algorithm (Primary)

The application uses the **Louvain method** for community detection, which is:
- **Fast**: Runs in O(n log n) time, suitable for large graphs
- **Quality-focused**: Optimizes modularity, a measure of community structure quality
- **Hierarchical**: Can detect communities at multiple scales

#### How it works:
1. **Initialization**: Each node starts in its own community
2. **Local optimization**: Iteratively move nodes to neighboring communities if it improves modularity
3. **Convergence**: Repeat until no more improvements can be made

#### Modularity Score:
The algorithm reports a modularity score (0 to 1):
- **0.0-0.3**: Weak community structure
- **0.3-0.5**: Moderate community structure  
- **0.5-0.7**: Strong community structure
- **0.7+**: Very strong community structure (rare)

### Label Propagation Algorithm (Alternative)

Also implemented as a faster alternative:
- Each node adopts the most common label among its neighbors
- Very fast but less optimal than Louvain
- Good for initial exploration of very large graphs

## Features

### Communities View

Access via the **Communities** button in the controls panel.

#### Overview Statistics:
- **Total Communities**: Number of detected communities
- **Average Size**: Mean number of nodes per community
- **Modularity Score**: Quality metric (0-1, higher is better)
- **Inter-Community Links**: Connections between different communities

#### Community Cards:
Each community displays:
- **Color indicator**: Unique color assigned via golden ratio distribution
- **Label**: Named after the most connected node in the community
- **Size**: Number of nodes in the community
- **Percentage**: Share of total network
- **Top nodes**: Up to 5 most connected members (clickable to focus)

#### Community Details:
Click any community card to see:
- Size and rank
- Full list of top member nodes
- Direct navigation to graph views

### Community Colors in Graph Views

Once communities are detected, you can visualize them in the 2D and 3D graph views:

1. **Detect communities** in the Communities view
2. Switch to **3D Graph** or **2D Graph** view
3. **Toggle "Use community colors"** checkbox in controls
4. Nodes are colored by their community membership

This reveals:
- **Spatial clustering**: Communities often cluster spatially
- **Bridge nodes**: Nodes connecting different communities
- **Community boundaries**: Visual separation between groups

## Use Cases

### 1. Understanding Network Structure
Identify natural groupings and how the network self-organizes.

### 2. Finding Related Subreddits
Communities often contain thematically similar subreddits and their active users.

### 3. Identifying Influencers
High-degree nodes within communities are often influential in their cluster.

### 4. Detecting Overlap
Users who bridge multiple communities connect different interest groups.

### 5. Content Strategy
Communities reveal distinct user segments for targeted content.

## Technical Details

### Algorithm Implementation

Location: `frontend/src/utils/communityDetection.ts`

#### Main Functions:

**`detectCommunities(data: GraphData): CommunityResult`**
- Runs Louvain algorithm on graph data
- Returns communities, node-to-community mapping, and modularity

**`detectCommunitiesLPA(data: GraphData): CommunityResult`**
- Runs Label Propagation Algorithm
- Faster but less optimal alternative

**`getCommunityColor(nodeId: string, communities: CommunityResult): string`**
- Helper to get community color for a node

#### Data Structures:

```typescript
interface Community {
  id: number;
  nodes: string[];
  size: number;
  color: string;
  label?: string;
  topNodes?: Array<{ id: string; name: string; degree: number }>;
}

interface CommunityResult {
  communities: Community[];
  nodeCommunities: Map<string, number>;
  modularity: number;
}
```

### Color Assignment

Communities are assigned colors using the **golden ratio distribution**:
```
hue = (community_id * 137.5) % 360
```
This ensures visually distinct colors with good separation across the spectrum.

### Performance

- **Louvain**: Handles 10K+ nodes comfortably (1-5 seconds)
- **Label Propagation**: Handles 50K+ nodes quickly (<1 second)
- **UI**: Computations run asynchronously to avoid blocking

## Interpretation Tips

### Good Community Structure
- **Clear boundaries**: Few inter-community links
- **High modularity**: Score > 0.4
- **Meaningful groups**: Communities align with semantic categories

### Examples in Reddit Data:

1. **Subreddit communities**: Related subreddits cluster together
   - Example: Tech subreddits (programming, linux, technology)
   - Example: Gaming subreddits (gaming, pcgaming, games)

2. **User communities**: Users who post in similar subreddits
   - Power users often bridge multiple communities
   - Specialized users concentrated in single communities

3. **Content hierarchies**: Post and comment communities under subreddits
   - High engagement posts form dense clusters
   - Comment chains create sub-communities

### Poor Community Structure
- **Many tiny communities**: May indicate sparse data or noisy connections
- **One giant community**: Network lacks structure or is too homogeneous
- **Low modularity**: < 0.3 suggests weak or no community structure

## Future Enhancements

Potential additions to the community detection system:

1. **Hierarchical Communities**: Detect nested community structures
2. **Temporal Communities**: Track how communities evolve over time
3. **Overlapping Communities**: Allow nodes to belong to multiple communities
4. **Community Comparison**: Compare community structures across time periods
5. **Export Communities**: Download community membership lists
6. **Custom Coloring**: User-defined color schemes for communities
7. **Community Merging**: Manually merge similar communities
8. **Semantic Labeling**: Auto-generate descriptive labels using NLP

## Performance Tuning

### For Large Graphs (>20K nodes):

1. **Filter first**: Use type filters to reduce graph size
2. **Use LPA**: Switch to Label Propagation for initial analysis
3. **Limit data**: Reduce max_nodes query parameter
4. **Batch processing**: Consider server-side computation for huge graphs

### For Better Results:

1. **Remove isolates**: Enable "Only show linked nodes"
2. **Meaningful connections**: Ensure graph has semantic relationships
3. **Balanced types**: Mix of node types often yields better communities
4. **Clean data**: Remove spam/bot accounts before analysis

## References

- Blondel, V. D., et al. "Fast unfolding of communities in large networks." Journal of Statistical Mechanics: Theory and Experiment (2008).
- Newman, M. E. J. "Modularity and community structure in networks." PNAS (2006).
- Raghavan, U. N., et al. "Near linear time algorithm to detect community structures in large-scale networks." Physical Review E (2007).
