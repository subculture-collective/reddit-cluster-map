# Frontend (Vite + React 3D)

This app renders the Reddit Cluster Map using `react-force-graph-3d`.

## Dev commands

- Install deps: `npm ci`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Environment

- `VITE_API_URL` — Base for API calls (default `/api`).
- Optional render caps (client-side):
  - `VITE_MAX_RENDER_NODES`
  - `VITE_MAX_RENDER_LINKS`

The frontend fetches `${VITE_API_URL || '/api'}/graph?max_nodes=...&max_links=...` and renders the result.

## Notes

- Ensure there is no trailing slash in `VITE_API_URL` to avoid double slashes in requests.
- When running with Docker, nginx in the frontend container proxies `/api/` to the backend API.
