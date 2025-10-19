# Integration Guide for PR #62

This document explains how to integrate the VirtualList key fix into PR #62.

## Background

PR #62 introduced a VirtualList component that uses array index as React key:
```tsx
{visibleItems.map((item, i) => (
  <div key={startIndex + i}>{renderItem(item, startIndex + i)}</div>
))}
```

This was identified as problematic in review comment #r2442683366 because using array indices as keys causes rendering issues when items are added, removed, or reordered.

## The Fix

This PR fixes VirtualList by:
1. Adding a required `itemKey` prop function
2. Using `itemKey(item, actualIndex)` for keys instead of index

## Files to Update in PR #62

### 1. VirtualList.tsx
Replace the version in PR #62 with this fixed version from this PR.

### 2. Dashboard.tsx
Update the three VirtualList usages:

**Top Nodes list** (around line 265):
```tsx
<VirtualList
  items={stats.topNodes}
  itemHeight={48}
  containerHeight={480}
  className="space-y-2"
  itemKey={(node) => node.id}  // ADD THIS LINE
  renderItem={(node, i) => (
    // ... existing render code
  )}
/>
```

**Top Subreddits list** (around line 294):
```tsx
<VirtualList
  items={stats.topSubreddits}
  itemHeight={48}
  containerHeight={480}
  className="space-y-2"
  itemKey={(sub) => sub.id}  // ADD THIS LINE
  renderItem={(sub, i) => (
    // ... existing render code
  )}
/>
```

**Most Active Users list** (around line 329):
```tsx
<VirtualList
  items={stats.mostActiveUsers}
  itemHeight={48}
  containerHeight={480}
  className="space-y-2"
  itemKey={(user) => user.id}  // ADD THIS LINE
  renderItem={(user, i) => (
    // ... existing render code
  )}
/>
```

### 3. Communities.tsx
If there are VirtualList usages, add similar `itemKey` props:

```tsx
<VirtualList
  items={communityResult.communities}
  itemHeight={...}
  containerHeight={...}
  itemKey={(community) => community.id.toString()}  // ADD THIS LINE
  renderItem={(community, i) => (
    // ... existing render code
  )}
/>
```

### 4. Inspector.tsx
If there are VirtualList usages for neighbors:

```tsx
<VirtualList
  items={selected.neighbors}
  itemHeight={...}
  containerHeight={...}
  itemKey={(neighbor) => neighbor.id}  // ADD THIS LINE
  renderItem={(neighbor, i) => (
    // ... existing render code
  )}
/>
```

## Testing After Integration

After applying these changes to PR #62:

1. **Build check**:
   ```bash
   cd frontend
   npm run build
   ```

2. **Lint check**:
   ```bash
   npm run lint
   ```

3. **Type check**:
   ```bash
   npm run build # TypeScript compilation happens here
   ```

4. **Manual testing**:
   - Open the dashboard
   - Scroll through the virtualized lists
   - Verify no console errors
   - Check that items render correctly

## Why This Matters

Without stable keys:
- ❌ React may reuse wrong DOM nodes when scrolling
- ❌ Component state can be lost
- ❌ Animations may glitch
- ❌ Focus behavior may be incorrect

With stable keys:
- ✅ React correctly tracks each item
- ✅ Smooth scrolling behavior
- ✅ Correct state preservation
- ✅ Proper animations and focus

## Questions?

Refer to `VirtualList.example.md` for more examples and usage patterns.
