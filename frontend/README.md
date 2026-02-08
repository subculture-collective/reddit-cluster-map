# Frontend (Vite + React 3D)

This app renders the Reddit Cluster Map using `react-force-graph-3d`.

## Dev commands

- Install deps: `npm ci`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Check bundle size: `npm run size`

## Bundle Size Tracking

The project includes automated bundle size tracking to prevent performance regressions.

### Bundle Size Limits

- **JS Bundle**: 500 KB (gzipped)
- **CSS Bundle**: 50 KB (gzipped)

### CI Integration

On every pull request:
1. Bundle is built and analyzed
2. Size is compared against the base branch
3. CI fails if bundle exceeds limits
4. PR comment shows size comparison with diff
5. Bundle visualization (treemap) is generated as an artifact

### Local Testing

To check bundle size locally:

```bash
npm run build
npm run size
```

To see detailed JSON output:

```bash
npm run size:json
```

### Bundle Analysis

After building, a detailed bundle analysis is available at `dist/stats.html`. Open this file in a browser to see:
- Interactive treemap of all modules
- Size breakdown by package
- Gzip and Brotli compressed sizes

### Configuration

Bundle size limits are configured in `.size-limit.json`. To adjust limits:

1. Edit `.size-limit.json`
2. Update the `limit` values
3. Commit the changes

The CI will enforce the new limits on subsequent PRs.

## Environment

- `VITE_API_URL` — Base for API calls (default `/api`).
- Optional render caps (client-side):
  - `VITE_MAX_RENDER_NODES`
  - `VITE_MAX_RENDER_LINKS`

The frontend fetches `${VITE_API_URL || '/api'}/graph?max_nodes=...&max_links=...` and renders the result.

## Notes

- Ensure there is no trailing slash in `VITE_API_URL` to avoid double slashes in requests.
- When running with Docker, nginx in the frontend container proxies `/api/` to the backend API.

## Features

### Edge Bundling

The frontend includes an edge bundling feature that reduces visual clutter in dense graphs by grouping links between communities into curved bundles.

**How it works:**
1. Links between the same source and target communities are grouped together
2. Groups with ≥3 links are rendered as single curved tubes (bundles)
3. Bundle thickness scales logarithmically with the number of links
4. Bundle colors blend the colors of the connected communities

**Usage:**
- Enable community detection in the UI
- Toggle "Bundle edges" checkbox to enable/disable bundling
- Bundles update dynamically as the graph simulation runs

**Implementation:**
- Core logic: `src/rendering/EdgeBundler.ts`
- Integration: `src/components/Graph3D.tsx`
- Uses THREE.js `TubeGeometry` and `CatmullRomCurve3` for smooth curves

