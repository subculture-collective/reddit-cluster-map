# Manual Testing Guide - Node Interactions

This guide provides step-by-step instructions for manually testing the node interaction features implemented in Graph3DInstanced.

## Prerequisites

1. Backend and database running: `make up`
2. Graph data loaded (at least one subreddit crawled)
3. Frontend accessible at `http://localhost:5173` (dev) or via Docker

## Test Cases

### Test 1: Hover Detection & Tooltip

**Objective:** Verify tooltip appears when hovering over nodes

**Steps:**
1. Navigate to the main graph view
2. Ensure Graph3DInstanced is active (check that InstancedMesh rendering is being used)
3. Move mouse slowly over different nodes
4. Verify tooltip appears within 50ms showing:
   - Node name (or ID if name not available)
   - Node type (subreddit, user, post, or comment)
5. Move mouse between nodes quickly
6. Verify tooltip updates correctly

**Expected Results:**
- ✅ Tooltip appears near cursor with 15px offset
- ✅ Tooltip shows correct node name and type
- ✅ Cursor changes to pointer on hover
- ✅ No lag or FPS drops during rapid mouse movement
- ✅ Tooltip disappears when mouse leaves nodes

**Visual Indicators:**
- Tooltip: Black background with white text
- Cursor: Changes from default to pointer
- Position: 15px right and below cursor

---

### Test 2: Node Selection (Click)

**Objective:** Verify node selection on click with visual highlight

**Steps:**
1. Click on any node in the graph
2. Verify the node is highlighted
3. Check browser console for selection callback
4. Click on a different node
5. Verify highlight moves to new node

**Expected Results:**
- ✅ Clicked node turns yellow (#ffff00)
- ✅ Only one node highlighted at a time
- ✅ `onNodeSelect` callback fires with correct node ID
- ✅ Selection update takes <16ms (check dev console)
- ✅ No visual artifacts or flickering

**Visual Indicators:**
- Selected node: Bright yellow color
- Previous selection: Returns to original color
- Performance: Check console for "interaction:selection-highlight" timing

---

### Test 3: Double-Click Zoom

**Objective:** Verify smooth camera animation on double-click

**Steps:**
1. Double-click on a node far from current camera position
2. Observe camera animation
3. Verify animation completes in 1 second
4. Try double-clicking multiple nodes in succession
5. Verify each animation completes smoothly

**Expected Results:**
- ✅ Camera smoothly moves to node (1 second duration)
- ✅ Node ends up centered in view
- ✅ Camera positioned ~150 units from node
- ✅ Orbit controls target set to node position
- ✅ Animation uses ease-in-out motion (not linear)
- ✅ No jarring movements or skips

**Visual Indicators:**
- Animation: Smooth acceleration and deceleration
- Final position: Node centered in viewport
- Camera distance: Consistent 150 units

---

### Test 4: Performance Under Load

**Objective:** Verify interactions maintain 60fps with many nodes

**Steps:**
1. Load a large graph (10k+ nodes if available)
2. Open browser DevTools Performance tab
3. Start recording
4. Move mouse rapidly over many nodes
5. Click several nodes
6. Double-click to zoom
7. Stop recording and analyze

**Expected Results:**
- ✅ FPS stays above 55fps during all interactions
- ✅ Raycasting takes <10ms per call (check console logs)
- ✅ Selection updates take <2ms (check console logs)
- ✅ No long tasks or janking in timeline
- ✅ Memory usage remains stable

**Performance Metrics:**
Monitor console for these logs every 10 seconds:
```
[Performance Summary]
interaction:raycast: 3-10ms (depends on node count)
interaction:selection-highlight: 1-2ms
```

**Warning Signs:**
- ⚠️ Raycasting >16ms (indicates throttling may need adjustment)
- ⚠️ FPS drops below 50fps
- ⚠️ Console warnings about exceeding frame budget

---

### Test 5: Selection Persistence & Clearing

**Objective:** Verify selection behavior across filter changes

**Steps:**
1. Select a node (click it)
2. Verify it's highlighted
3. Change type filters (e.g., toggle off "users")
4. If selected node is filtered out, verify highlight is cleared
5. If selected node remains, verify highlight persists
6. Reload graph data
7. Verify selection is cleared

**Expected Results:**
- ✅ Selection clears when selected node filtered out
- ✅ Selection persists when selected node remains visible
- ✅ Selection clears on data reload
- ✅ No orphaned highlights or color artifacts

---

### Test 6: Throttling Effectiveness

**Objective:** Verify raycasting is properly throttled to 30Hz

**Steps:**
1. Open browser DevTools console
2. Enable verbose performance logging (if available)
3. Move mouse rapidly in circles over graph
4. Observe console logs for raycast frequency
5. Verify raycasts occur at most every 33ms

**Expected Results:**
- ✅ Maximum ~30 raycasts per second
- ✅ No raycasts within 33ms of each other
- ✅ Mouse movement remains smooth
- ✅ Tooltip updates feel responsive (not laggy)

**How to Verify:**
Check console for timing between "interaction:raycast" entries. Should be ≥33ms apart.

---

## Performance Benchmarks

### Target Performance (60fps = 16.67ms frame budget)

| Operation | Target | Expected | Status |
|-----------|--------|----------|--------|
| Raycast (1k nodes) | <5ms | 2-3ms | ✅ |
| Raycast (10k nodes) | <10ms | 5-8ms | ✅ |
| Raycast (100k nodes) | <15ms | 10-14ms | ✅ |
| Selection Update | <2ms | 1-2ms | ✅ |
| Tooltip Display | <50ms | <20ms | ✅ |
| Camera Animation Frame | <16ms | 5-10ms | ✅ |

### Browser Compatibility

Test in these browsers:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (if available)

### Known Limitations

1. **WebGL Required:** Interactions won't work if WebGL is disabled
2. **Mouse Only:** Touch events not yet implemented
3. **Single Selection:** Multi-select not yet supported
4. **No Octree:** Performance may degrade with 1M+ nodes

---

## Debugging Tips

### Tooltip Not Appearing
1. Check if WebGL is working (canvas should render)
2. Verify `hoveredNode` state is updating (React DevTools)
3. Check if nodes exist in filtered data
4. Look for JavaScript errors in console

### Selection Not Highlighting
1. Verify `updateColors()` is called (console log)
2. Check if InstancedMesh has instanceColor attribute
3. Ensure node ID matches in filtered data
4. Look for THREE.js warnings

### Poor Performance
1. Check node/link count (may be too high)
2. Verify throttling is working (console logs)
3. Check for memory leaks (DevTools Memory tab)
4. Disable other browser extensions

### Camera Animation Jumpy
1. Check FPS during animation (should be 60fps)
2. Verify easing function is correct
3. Look for console warnings
4. Check if controls are conflicting

---

## Success Criteria

All features working correctly when:
- ✅ All 6 test cases pass
- ✅ Performance metrics within targets
- ✅ No console errors or warnings
- ✅ Visual appearance matches expectations
- ✅ No memory leaks during extended use

---

## Reporting Issues

If any test fails, include:
1. Test case number and name
2. Browser and version
3. Node/link count in graph
4. Console logs and errors
5. Performance timeline (if relevant)
6. Screenshots or screen recording

## Automated Testing

Run automated tests:
```bash
cd frontend
npm run test:run
```

Expected: 191 tests pass, 0 failures
