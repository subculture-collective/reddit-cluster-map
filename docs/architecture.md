# System Architecture

This document provides a comprehensive overview of the Reddit Cluster Map architecture, including component interactions, data flow, and design decisions.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Component Diagram](#component-diagram)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [API Architecture](#api-architecture)
- [Graph Generation Pipeline](#graph-generation-pipeline)
- [Deployment Architecture](#deployment-architecture)

## High-Level Architecture

```mermaid
graph TB
    subgraph "External"
        Reddit[Reddit API]
        User[End Users]
    end
    
    subgraph "Frontend"
        Web[React/Vite App<br/>3D Visualization]
        Nginx[Nginx Reverse Proxy]
    end
    
    subgraph "Backend Services"
        API[API Server<br/>Port 8000<br/>Go]
        Crawler[Crawler Worker<br/>Go]
        Precalc[Precalculate Job<br/>Hourly/On-Demand<br/>Go]
        Backup[Backup Service<br/>24h cycle]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL 17<br/>Normalized Data)]
        BackupVol[Backup Volume]
    end
    
    subgraph "Monitoring"
        Prom[Prometheus<br/>Port 9090]
        Graf[Grafana<br/>Port 3000]
    end
    
    User -->|HTTPS| Nginx
    Nginx -->|/api/*| API
    Nginx -->|Static| Web
    Web -->|Fetch Graph| API
    
    API -->|Read/Write| DB
    Crawler -->|Write| DB
    Precalc -->|Read/Transform| DB
    Precalc -->|Write| DB
    
    Crawler -->|OAuth + Rate Limited| Reddit
    
    API -->|Expose Metrics| Prom
    Prom -->|Scrape| API
    Graf -->|Query| Prom
    
    Backup -->|pg_dump| DB
    Backup -->|Write| BackupVol
    API -->|Read| BackupVol
    
    style DB fill:#4169E1,stroke:#000,stroke-width:2px,color:#fff
    style API fill:#2E8B57,stroke:#000,stroke-width:2px,color:#fff
    style Crawler fill:#2E8B57,stroke:#000,stroke-width:2px,color:#fff
    style Precalc fill:#2E8B57,stroke:#000,stroke-width:2px,color:#fff
```

## Component Diagram

### Backend Components

```mermaid
graph TB
    subgraph "API Server (cmd/server)"
        HTTP[HTTP Server<br/>Chi Router]
        Handlers[Request Handlers]
        Middleware[Middleware<br/>Rate Limit, CORS, Auth]
        Scheduler[Background Scheduler<br/>Hourly Graph Job]
    end
    
    subgraph "Crawler (cmd/crawler)"
        Worker[Job Worker<br/>Polling Loop]
        RedditClient[Reddit API Client<br/>OAuth + Rate Limiter]
        Parser[Data Parser]
        Discovery[Subreddit Discovery]
    end
    
    subgraph "Precalculate (cmd/precalculate)"
        GraphSvc[Graph Service]
        NodeGen[Node Generator]
        LinkGen[Link Generator]
        BatchWriter[Batch Writer]
    end
    
    subgraph "Shared Internal"
        Config[Config Loader]
        DB[SQLC Generated DB Layer]
        HTTPx[HTTP Retry Client]
        RateLimit[Global Rate Limiter<br/>601ms ticker]
    end
    
    HTTP --> Handlers
    HTTP --> Middleware
    Handlers --> DB
    Scheduler --> GraphSvc
    
    Worker --> DB
    Worker --> RedditClient
    RedditClient --> RateLimit
    RedditClient --> HTTPx
    Parser --> DB
    Discovery --> DB
    
    GraphSvc --> NodeGen
    GraphSvc --> LinkGen
    NodeGen --> BatchWriter
    LinkGen --> BatchWriter
    BatchWriter --> DB
    
    style Config fill:#FFD700,stroke:#000,stroke-width:2px
    style RateLimit fill:#FF6347,stroke:#000,stroke-width:2px,color:#fff
```

### Frontend Architecture

```mermaid
graph LR
    subgraph "React Application"
        Router[React Router]
        
        subgraph "Views"
            Graph3D[3D Graph View<br/>react-force-graph-3d]
            Graph2D[2D Graph View<br/>D3.js]
            Dashboard[Statistics Dashboard]
            Communities[Community Detection]
        end
        
        subgraph "State Management"
            GraphState[Graph Data State]
            FilterState[Filter State]
            PhysicsState[Physics Controls]
        end
        
        subgraph "API Layer"
            GraphAPI[Graph API Client]
            SearchAPI[Search API Client]
            CrawlAPI[Crawl API Client]
        end
    end
    
    Router --> Graph3D
    Router --> Graph2D
    Router --> Dashboard
    Router --> Communities
    
    Graph3D --> GraphState
    Graph2D --> GraphState
    Communities --> GraphState
    
    GraphState --> GraphAPI
    SearchAPI --> FilterState
    CrawlAPI --> GraphState
    
    style GraphState fill:#87CEEB,stroke:#000,stroke-width:2px
```

## Data Flow

### Crawl Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB
    participant Crawler
    participant Reddit
    
    User->>API: POST /api/crawl {"subreddit":"golang"}
    API->>DB: INSERT INTO crawl_jobs
    API-->>User: 200 Job enqueued
    
    loop Polling
        Crawler->>DB: SELECT pending job (priority order)
        DB-->>Crawler: Job details
    end
    
    Crawler->>Reddit: GET /r/golang/about.json
    Note over Crawler,Reddit: Rate limited 601ms
    Reddit-->>Crawler: Subreddit info
    Crawler->>DB: INSERT/UPDATE subreddits
    
    Crawler->>Reddit: GET /r/golang/hot.json
    Reddit-->>Crawler: Posts list
    Crawler->>DB: INSERT posts
    
    loop For each post
        Crawler->>Reddit: GET /r/golang/comments/{id}
        Reddit-->>Crawler: Comments tree
        Crawler->>DB: INSERT comments
        Crawler->>DB: Extract & store user_subreddit_activity
    end
    
    Crawler->>DB: UPDATE job status = completed
    
    Note over Crawler,DB: Discovery Phase
    Crawler->>DB: Find new authors
    Crawler->>DB: Enqueue user subreddit discovery
    Crawler->>DB: Enqueue mentioned subreddits
```

### Graph Generation Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant Precalc
    participant DB
    
    Note over Scheduler: Every hour or on-demand
    
    Scheduler->>Precalc: Trigger precalculation
    
    alt PRECALC_CLEAR_ON_START=true
        Precalc->>DB: DELETE FROM graph_nodes
        Precalc->>DB: DELETE FROM graph_links
    end
    
    Precalc->>DB: SELECT subreddits
    loop Batch writes
        Precalc->>Precalc: Generate subreddit nodes
        Precalc->>DB: INSERT graph_nodes (batch 1000)
    end
    
    Precalc->>DB: SELECT users with activity
    loop Batch writes
        Precalc->>Precalc: Generate user nodes
        Precalc->>DB: INSERT graph_nodes (batch 1000)
    end
    
    alt DETAILED_GRAPH=true
        Precalc->>DB: SELECT posts (limited by POSTS_PER_SUB_IN_GRAPH)
        Precalc->>DB: INSERT graph_nodes (post nodes)
        
        Precalc->>DB: SELECT comments (limited by COMMENTS_PER_POST_IN_GRAPH)
        Precalc->>DB: INSERT graph_nodes (comment nodes)
    end
    
    Note over Precalc: Generate Links
    
    Precalc->>DB: Calculate subreddit overlap
    Precalc->>DB: INSERT graph_links (subreddit↔subreddit, batch 2000)
    
    Precalc->>DB: SELECT user_subreddit_activity
    Precalc->>DB: INSERT graph_links (user→subreddit, batch 2000)
    
    alt DETAILED_GRAPH=true
        Precalc->>DB: Generate post→subreddit links
        Precalc->>DB: Generate comment→post links
        Precalc->>DB: Generate user→content links
        Precalc->>DB: Generate author cross-links (MAX_AUTHOR_CONTENT_LINKS)
    end
    
    Precalc-->>Scheduler: Precalculation complete
```

### API Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant API
    participant Cache
    participant DB
    
    Client->>Nginx: GET /api/graph?max_nodes=20000
    Nginx->>API: Forward request
    
    API->>API: Check rate limit (per-IP + global)
    
    alt Cache hit (60s TTL)
        API->>Cache: Lookup cache key
        Cache-->>API: Cached response
        API-->>Client: 200 + cached graph JSON
    else Cache miss
        API->>DB: SELECT FROM graph_nodes (ORDER BY val DESC)
        API->>DB: SELECT FROM graph_links
        
        API->>API: Apply max_nodes/max_links caps<br/>Weight by max(val, degree)
        
        API->>API: Format GraphResponse
        API->>Cache: Store response (60s)
        API-->>Client: 200 + graph JSON
    end
    
    Note over Client,API: Positions included if with_positions=true<br/>and pos_x/pos_y/pos_z exist
```

## Database Schema

### Core Tables

```mermaid
erDiagram
    subreddits ||--o{ posts : contains
    subreddits ||--o{ crawl_jobs : targets
    users ||--o{ posts : authors
    users ||--o{ comments : authors
    posts ||--o{ comments : has
    comments ||--o{ comments : parent_of
    
    users ||--o{ user_subreddit_activity : participates
    subreddits ||--o{ user_subreddit_activity : tracks
    
    subreddits ||--o{ subreddit_relationships : relates
    subreddits ||--o{ subreddit_relationships : related_to
    
    subreddits {
        bigserial id PK
        text reddit_id UK
        text name
        text display_name
        timestamp created_at
        timestamp last_crawled_at
    }
    
    users {
        bigserial id PK
        text username UK
        timestamp created_at
        timestamp last_seen_at
    }
    
    posts {
        bigserial id PK
        text reddit_id UK
        bigint subreddit_id FK
        bigint author_id FK
        text title
        timestamp created_at
    }
    
    comments {
        bigserial id PK
        text reddit_id UK
        bigint post_id FK
        bigint author_id FK
        bigint parent_comment_id FK
        text body
        timestamp created_at
    }
    
    crawl_jobs {
        bigserial id PK
        text subreddit_name
        text status
        int priority
        timestamp created_at
        timestamp completed_at
    }
    
    user_subreddit_activity {
        bigserial id PK
        bigint user_id FK
        bigint subreddit_id FK
        int post_count
        int comment_count
        timestamp last_activity_at
    }
```

### Graph Tables

```mermaid
erDiagram
    graph_nodes ||--o{ graph_links : source
    graph_nodes ||--o{ graph_links : target
    
    graph_nodes {
        text id PK "Prefixed: user_*, subreddit_*, post_*, comment_*"
        text name
        text val "Numeric value as text"
        text type "user, subreddit, post, comment"
        double pos_x "Precomputed X position"
        double pos_y "Precomputed Y position"  
        double pos_z "Precomputed Z position"
    }
    
    graph_links {
        bigserial id PK
        text source FK "References graph_nodes.id"
        text target FK "References graph_nodes.id"
        text val "Link weight/value"
    }
```

### Indexes

Key indexes for performance:

```sql
-- Crawl job processing
CREATE INDEX idx_crawl_jobs_status_priority 
ON crawl_jobs(status, priority DESC, created_at);

-- Graph queries
CREATE INDEX idx_graph_nodes_type ON graph_nodes(type);
CREATE INDEX idx_graph_nodes_val ON graph_nodes(val DESC);
CREATE INDEX idx_graph_links_source ON graph_links(source);
CREATE INDEX idx_graph_links_target ON graph_links(target);

-- User activity lookups
CREATE INDEX idx_user_subreddit_activity_user 
ON user_subreddit_activity(user_id);
CREATE INDEX idx_user_subreddit_activity_subreddit 
ON user_subreddit_activity(subreddit_id);

-- Content relationships
CREATE INDEX idx_posts_subreddit ON posts(subreddit_id);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
```

## API Architecture

### Request Processing Pipeline

```mermaid
graph TB
    Request[Incoming Request] --> RateLimit{Rate Limit Check}
    RateLimit -->|Exceeded| Reject[429 Too Many Requests]
    RateLimit -->|OK| CORS[CORS Middleware]
    
    CORS --> Auth{Auth Required?}
    Auth -->|Yes| CheckToken{Valid Token?}
    CheckToken -->|No| Unauthorized[401 Unauthorized]
    CheckToken -->|Yes| Router
    Auth -->|No| Router[Router]
    
    Router --> Handler[Handler Function]
    Handler --> Validate[Validate Input]
    
    Validate -->|Invalid| BadRequest[400 Bad Request]
    Validate -->|Valid| Cache{Cache Available?}
    
    Cache -->|Hit| Response[Return Cached Response]
    Cache -->|Miss| Database[(Database Query)]
    
    Database --> Transform[Transform Data]
    Transform --> CacheStore[Store in Cache]
    CacheStore --> Response
    
    Response --> Log[Access Log]
    Log --> Metrics[Update Prometheus Metrics]
    Metrics --> Return[200 OK + JSON]
    
    style Reject fill:#FF6B6B,color:#fff
    style Unauthorized fill:#FF6B6B,color:#fff
    style BadRequest fill:#FF6B6B,color:#fff
    style Return fill:#51CF66,color:#fff
```

### Endpoint Categories

**Public Endpoints:**
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /api/graph` - Graph data (cached)
- `GET /api/communities` - Community supernodes
- `GET /api/communities/{id}` - Community subgraph
- `GET /api/search` - Search nodes
- `GET /api/export` - Export graph data

**Resource Endpoints:**
- `GET /subreddits` - List subreddits
- `GET /users` - List users
- `GET /posts` - List posts
- `GET /comments` - List comments
- `GET /jobs` - List crawl jobs

**Admin Endpoints** (require `ADMIN_API_TOKEN`):
- `POST /api/crawl` - Enqueue crawl job
- `POST /admin/*` - Administrative operations

## Graph Generation Pipeline

### Node Generation Strategy

```mermaid
graph TB
    Start[Start Precalculation] --> Clear{PRECALC_CLEAR_ON_START?}
    Clear -->|Yes| Truncate[TRUNCATE graph_nodes, graph_links]
    Clear -->|No| Continue
    Truncate --> Continue[Continue]
    
    Continue --> GenSubs[Generate Subreddit Nodes]
    GenSubs --> GenUsers[Generate User Nodes]
    
    GenUsers --> DetailCheck{DETAILED_GRAPH?}
    DetailCheck -->|Yes| GenPosts[Generate Post Nodes<br/>Limit: POSTS_PER_SUB_IN_GRAPH]
    GenPosts --> GenComments[Generate Comment Nodes<br/>Limit: COMMENTS_PER_POST_IN_GRAPH]
    GenComments --> LinkGen
    
    DetailCheck -->|No| LinkGen[Link Generation]
    
    LinkGen --> SubLinks[Subreddit↔Subreddit Links<br/>Based on shared users]
    SubLinks --> UserLinks[User→Subreddit Links<br/>From activity table]
    
    UserLinks --> DetailLinks{DETAILED_GRAPH?}
    DetailLinks -->|Yes| ContentLinks[Content Links:<br/>post→subreddit<br/>comment→post<br/>user→content<br/>author cross-links]
    ContentLinks --> Complete
    
    DetailLinks -->|No| Complete[Complete]
    Complete --> Log[Log Statistics]
    
    style Start fill:#51CF66,color:#fff
    style Complete fill:#51CF66,color:#fff
```

### Batch Processing

Precalculation uses batching to optimize performance:

1. **Node batches** (`GRAPH_NODE_BATCH_SIZE=1000`)
   - Collects nodes in memory
   - Bulk INSERT every 1000 nodes
   - Reduces database round-trips

2. **Link batches** (`GRAPH_LINK_BATCH_SIZE=2000`)
   - Larger batches for links (simpler data)
   - Bulk INSERT every 2000 links

3. **Progress logging** (`GRAPH_PROGRESS_INTERVAL=10000`)
   - Logs progress every 10,000 items
   - Helps monitor long-running precalculations

### Node ID Prefixing

All graph nodes use prefixed IDs for type safety:

- `subreddit_123` - Subreddit with database ID 123
- `user_456` - User with database ID 456
- `post_789` - Post with database ID 789
- `comment_101` - Comment with database ID 101

This prevents ID collisions and enables type identification without additional queries.

## Deployment Architecture

### Docker Compose Stack

```mermaid
graph TB
    subgraph "Docker Host"
        subgraph "Network: web"
            Frontend[reddit_frontend:80]
            API[api:8000]
            Crawler[crawler]
            Precalc[precalculate]
            Backup[backup]
            DB[db:5432]
            Prom[prometheus:9090]
            Graf[grafana:3000]
        end
        
        subgraph "Volumes"
            PGData[postgres_data]
            PGBackup[pgbackups]
            PromData[prometheus_data]
            GrafData[grafana_data]
        end
    end
    
    DB --> PGData
    Precalc --> PGBackup
    Backup --> PGBackup
    API -.->|read-only| PGBackup
    Prom --> PromData
    Graf --> GrafData
    
    Frontend --> API
    API --> DB
    Crawler --> DB
    Precalc --> DB
    Backup --> DB
    Prom --> API
    Graf --> Prom
    
    style DB fill:#4169E1,color:#fff
    style PGData fill:#FFD700
    style PGBackup fill:#FFD700
```

### Production Considerations

**Reverse Proxy Setup:**
```
Internet → Nginx/Traefik → Docker Network → Services
```

Typical nginx configuration:
```nginx
location /api/ {
    proxy_pass http://api:8000/api/;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location / {
    proxy_pass http://reddit_frontend:80/;
}
```

**Scaling Considerations:**

1. **Read Replicas**: Use PostgreSQL replication for read-heavy workloads
2. **Multiple Crawlers**: Scale horizontally with multiple crawler instances (they coordinate via database)
3. **CDN**: Serve static frontend assets via CDN
4. **Redis Cache**: Replace in-memory cache with Redis for multi-instance API deployments

**Security:**

- All services communicate on internal Docker network
- Only necessary ports exposed to host
- API rate limiting protects against abuse
- CORS configured to restrict origins
- Admin endpoints require bearer token authentication

## Design Decisions

### Why PostgreSQL?

- **Relational data**: Natural fit for Reddit's hierarchical data (subreddits → posts → comments)
- **ACID compliance**: Data integrity for crawl jobs and graph consistency
- **JSON support**: Flexible for storing Reddit API responses if needed
- **Performance**: Excellent query optimization with proper indexes
- **Replication**: Built-in support for read replicas

### Why Precalculated Graph?

- **Performance**: On-demand graph generation is too slow for interactive use
- **Caching**: Precomputed graph can be cached and served quickly
- **Consistency**: Hourly refresh provides stable, predictable data
- **Optimization**: Allows batch operations and optimized queries

### Why Global Rate Limiting?

- **Reddit API limits**: Respecting Reddit's rate limits prevents bans
- **Simplicity**: Single global ticker is easier to reason about than distributed limiting
- **Sufficient**: 1.66 rps is adequate for asynchronous crawling
- **Safe**: Prevents accidental rate limit violations

### Why sqlc?

- **Type safety**: Generated code provides compile-time safety
- **Performance**: No reflection overhead, direct SQL
- **Maintainability**: SQL stays in SQL files, easy to review and optimize
- **Testing**: Simple to mock generated interfaces

### Why Hourly Precalculation?

- **Balance**: Frequent enough for freshness, infrequent enough to not overload database
- **Predictable**: Scheduled jobs are easier to monitor and debug
- **Resource-friendly**: Allows crawler to work without competing for database resources
- **Flexible**: Can trigger on-demand when needed

## Monitoring Architecture

### Metrics Flow

```mermaid
graph LR
    API[API Server] -->|Expose /metrics| Prom[Prometheus]
    Crawler[Crawler] -->|Internal Metrics| API
    Precalc[Precalculate] -->|Job Metrics| DB
    API -->|Read Metrics| DB
    
    Prom -->|Scrape every 15s| Prom
    Prom -->|Store| PromDB[(Time Series DB)]
    
    Graf[Grafana] -->|Query PromQL| Prom
    Graf -->|Display| Dashboards[Pre-configured<br/>Dashboards]
    
    Prom -->|Evaluate| Alerts[Alert Rules]
    Alerts -->|Trigger| AlertMgr[Alert Manager<br/>Optional]
    
    style Prom fill:#E6522C,color:#fff
    style Graf fill:#F46800,color:#fff
```

### Key Metrics Collected

**API Metrics:**
- `http_requests_total{endpoint, method, status}` - Request count
- `http_request_duration_seconds{endpoint}` - Request latency histogram
- `api_graph_cache_hits_total` - Cache hit rate
- `api_rate_limit_exceeded_total{type}` - Rate limit violations

**Crawler Metrics:**
- `crawler_jobs_processed_total{status}` - Job completion count
- `crawler_posts_scraped_total` - Posts collected
- `crawler_comments_scraped_total` - Comments collected
- `crawler_reddit_api_calls_total{endpoint}` - Reddit API usage

**Graph Metrics:**
- `graph_nodes_total{type}` - Node counts by type
- `graph_links_total` - Total link count
- `graph_precalc_duration_seconds` - Precalculation time

**Database Metrics:**
- `db_operation_duration_seconds{operation}` - Query performance
- `db_errors_total{operation}` - Database error rate

See [docs/monitoring.md](./monitoring.md) for complete metrics reference and example queries.
