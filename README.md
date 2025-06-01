Here’s a clean and informative `README.md` you can drop into the root of your project. It’s designed to grow with your architecture, including placeholders for upcoming modules and notes on future extensibility.

---

```markdown
# Reddit Network Cluster Map

A full-stack application for collecting, analyzing, and visualizing Reddit communities and their user interactions as network graphs.

---

## 🧠 Project Goals

- Collect Reddit posts, comments, and user activity
- Store and normalize this data in a queryable format
- Analyze community connections, shared participation, and behavior patterns
- Visualize relationships and clusters as an interactive graph

---

## 🧱 Stack Overview

### 🖥 Frontend
- **React** — Component-based UI
- **Tailwind CSS** — Utility-first styling
- **D3.js** or **Cytoscape.js** — For interactive graph rendering and data-driven layouts (TBD)

### 🗃 Backend
- **Go** — REST API and data processing
- **PostgreSQL** — Persistent storage
- **sqlc** — Compile-time query generation
- **Prometheus + Grafana** — Monitoring and observability
- **Docker** — Containerized deployment

### 📡 Data Collection
- **Reddit API** — Real-time and recent posts/comments
- **Pushshift.io** — Historical Reddit archives

### 📊 Graph Analysis
- **NetworkX** or **igraph** (Python)
- **gonum/graph** (Go-native alternative for scalable analysis)

---

## 🔄 Workflow

1. **Crawl Subreddits**: Target subreddits are scheduled via crawl jobs.
2. **Fetch & Store**: Recent posts and comments are fetched and stored in Postgres.
3. **Analyze**: Graph relationships are derived from shared user activity, post/comment structure, and other metadata.
4. **Visualize**: Interactive network maps are rendered on the frontend.

---

## 📂 Project Structure

```

/backend
/cmd           # Entrypoints
/internal
/db          # sqlc-generated queries
/api         # REST routes
/server      # Core server logic
/utils       # Helper functions

/frontend
/components    # React UI components
/pages         # Routes/views
/styles        # Tailwind setup
/lib           # D3 or Cytoscape logic

/ops
docker-compose.yml  # Local dev stack
grafana/             # Dashboards
prometheus/          # Configs

````

---

## 🧪 Local Dev

**Requirements**:
- Docker
- Go 1.21+
- Node.js 18+

### Start Services:

```bash
make dev        # Launches API, DB, Prometheus, Grafana
make frontend   # Starts Vite dev server
````

### Env Variables:

```bash
cp .env.example .env
```

Ensure your `.env` includes:

```env
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
DATABASE_URL=postgres://...
```

---

## 📈 Metrics

* Prometheus scrapes metrics at `/metrics`
* Grafana dashboards visualize crawl jobs, DB health, and data volumes

---

## 🧠 Coming Soon

* [ ] User-submitted subreddit targeting
* [ ] In-browser cluster exploration with filters and tooltips
* [ ] GraphQL API layer for more flexible queries
* [ ] Community similarity scoring (Jaccard / Cosine / Graph embeddings)

---

## 🤝 Contributing

Pull requests and issues welcome! This project is being actively developed, so feedback and collaboration are appreciated.
