# VirtualList Component Usage

The `VirtualList` component provides efficient rendering for large lists by only rendering visible items.

## Key Prop Requirement

**Important**: The `itemKey` prop is required and must return a stable unique identifier for each item. Do not use array indices as keys.

## Good Examples

### Example 1: Using item ID
```tsx
<VirtualList
  items={nodes}
  itemHeight={48}
  containerHeight={480}
  itemKey={(node) => node.id}
  renderItem={(node, i) => (
    <div>{node.name}</div>
  )}
/>
```

### Example 2: Using composite key
```tsx
<VirtualList
  items={users}
  itemHeight={48}
  containerHeight={480}
  itemKey={(user) => `user-${user.id}`}
  renderItem={(user, i) => (
    <div>#{i + 1} {user.name}</div>
  )}
/>
```

### Example 3: When items don't have IDs
If your items don't have a stable ID, use a combination of stable properties:
```tsx
<VirtualList
  items={items}
  itemHeight={48}
  containerHeight={480}
  itemKey={(item) => `${item.type}-${item.name}`} // Use stable properties
  renderItem={(item, i) => (
    <div>{item.name}</div>
  )}
/>
```

Or add a stable ID when loading data:
```tsx
// When fetching/loading data, add stable IDs once
// ⚠️ Important: Do this during data loading, not during rendering!
import { v4 as uuidv4 } from 'uuid';

// Option 1: Generate UUID once when data is loaded
useEffect(() => {
  async function loadData() {
    const rawItems = await fetchItems();
    const itemsWithIds = rawItems.map((item) => ({
      ...item,
      stableId: uuidv4() // Generate once when loading
    }));
    setItems(itemsWithIds);
  }
  loadData();
}, []);

// Option 2: If items have natural unique identifiers, combine them
const itemsWithIds = rawItems.map((item) => ({
  ...item,
  stableId: `${item.type}-${item.timestamp}-${item.userId}` // Combine stable properties
}));

<VirtualList
  items={itemsWithIds}
  itemHeight={48}
  containerHeight={480}
  itemKey={(item) => item.stableId}
  renderItem={(item, i) => (
    <div>{item.name}</div>
  )}
/>
```

**Note**: Never generate fresh UUIDs at render time in the `itemKey` function itself – this would create different keys on each render and defeat the purpose of stable keys!

## Bad Examples (Do Not Use)

### Bad Example 1: Using index as key
```tsx
// ❌ BAD: Using index as key.
// This defeats the purpose! Using index as key causes React to incorrectly 
// reuse DOM nodes when items are reordered, added, or removed.
<VirtualList
  items={nodes}
  itemHeight={48}
  containerHeight={480}
  itemKey={(node, index) => index.toString()}
  renderItem={(node, i) => (
    <div>{node.name}</div>
  )}
/>
```

### Bad Example 2: Generating new UUIDs in itemKey
```tsx
// ❌ BAD: Generating new UUIDs on each render.
// This creates different keys every render, breaking React's reconciliation.
<VirtualList
  items={nodes}
  itemHeight={48}
  containerHeight={480}
  itemKey={(node) => uuidv4()} // New UUID every time!
  renderItem={(node, i) => (
    <div>{node.name}</div>
  )}
/>
```

## Why Stable Keys Matter

When items are added, removed, or reordered:
- **With stable keys**: React can efficiently reuse DOM nodes and maintain component state
- **With index keys**: React may incorrectly reuse DOM nodes, causing:
  - Wrong data displayed in components
  - Loss of local component state (e.g., expanded/collapsed state)
  - Incorrect animations
  - Focus issues

## Integration with Dashboard Component

For the Dashboard component in PR #62, use the item's `id` field:

```tsx
<VirtualList
  items={stats.topNodes}
  itemHeight={48}
  containerHeight={480}
  className="space-y-2"
  itemKey={(node) => node.id}
  renderItem={(node, i) => (
    <div
      className="flex items-center justify-between p-2 bg-gray-700 rounded hover:bg-gray-600 cursor-pointer"
      onClick={() => {
        onFocusNode?.(node.name || node.id);
        onViewMode?.("3d");
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-gray-400 w-6">{i + 1}</div>
        <div>
          <div className="font-medium">{node.name}</div>
          <div className="text-xs text-gray-400 capitalize">{node.type}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold">{node.degree}</div>
        <div className="text-xs text-gray-400">connections</div>
      </div>
    </div>
  )}
/>
```
