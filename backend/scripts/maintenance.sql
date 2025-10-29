-- Database Maintenance Script for Reddit Cluster Map
-- This script contains common maintenance operations for PostgreSQL

-- ============================================
-- VACUUM Operations
-- ============================================

-- VACUUM ANALYZE updates statistics and reclaims space
-- Run regularly on tables with high update/delete activity

-- Full database vacuum (can be time-consuming)
-- VACUUM ANALYZE;

-- Vacuum specific tables (recommended for regular maintenance)
VACUUM ANALYZE subreddits;
VACUUM ANALYZE users;
VACUUM ANALYZE posts;
VACUUM ANALYZE comments;
VACUUM ANALYZE graph_nodes;
VACUUM ANALYZE graph_links;
VACUUM ANALYZE crawl_jobs;

-- VACUUM FULL reclaims maximum space but requires exclusive lock
-- Use during maintenance windows only
-- VACUUM FULL posts;
-- VACUUM FULL comments;

-- ============================================
-- REINDEX Operations
-- ============================================

-- Rebuild indexes to remove bloat and improve performance
-- Use during maintenance windows as these operations lock tables

-- Reindex primary tables
-- REINDEX TABLE subreddits;
-- REINDEX TABLE users;
-- REINDEX TABLE posts;
-- REINDEX TABLE comments;
-- REINDEX TABLE graph_nodes;
-- REINDEX TABLE graph_links;

-- Reindex specific indexes if needed
-- REINDEX INDEX idx_posts_subreddit_id;
-- REINDEX INDEX idx_posts_author_id;
-- REINDEX INDEX idx_comments_post_id;
-- REINDEX INDEX idx_comments_author_id;
-- REINDEX INDEX idx_graph_nodes_type;
-- REINDEX INDEX idx_graph_links_source;
-- REINDEX INDEX idx_graph_links_target;

-- Reindex entire database (use cautiously)
-- REINDEX DATABASE reddit_cluster;

-- ============================================
-- Statistics Update
-- ============================================

-- Update table statistics for query planner
-- Run after significant data changes

ANALYZE subreddits;
ANALYZE users;
ANALYZE posts;
ANALYZE comments;
ANALYZE graph_nodes;
ANALYZE graph_links;

-- ============================================
-- Check Table and Index Sizes
-- ============================================

-- View table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View index sizes and usage
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- Bloat Detection
-- ============================================

-- Identify tables with dead tuples that need vacuuming
SELECT
    schemaname,
    tablename,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples,
    ROUND(100 * n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_percent,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND (n_live_tup + n_dead_tup) > 1000
ORDER BY n_dead_tup DESC;

-- ============================================
-- Connection and Lock Monitoring
-- ============================================

-- View current connections
SELECT 
    datname,
    usename,
    application_name,
    client_addr,
    state,
    query_start,
    state_change
FROM pg_stat_activity
WHERE datname = 'reddit_cluster'
ORDER BY query_start DESC;

-- View locks
SELECT 
    locktype,
    relation::regclass,
    mode,
    granted,
    pid,
    usename,
    query_start
FROM pg_locks
JOIN pg_stat_activity USING (pid)
WHERE datname = 'reddit_cluster'
ORDER BY granted, query_start;

-- ============================================
-- Performance Tuning Queries
-- ============================================

-- Find slow queries (requires pg_stat_statements extension)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- 
-- SELECT
--     calls,
--     total_exec_time / 1000 AS total_time_seconds,
--     mean_exec_time / 1000 AS mean_time_seconds,
--     max_exec_time / 1000 AS max_time_seconds,
--     query
-- FROM pg_stat_statements
-- WHERE query NOT LIKE '%pg_stat_statements%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 20;

-- Find missing indexes (tables with sequential scans)
SELECT
    schemaname,
    tablename,
    seq_scan AS sequential_scans,
    seq_tup_read AS tuples_read_sequentially,
    idx_scan AS index_scans,
    n_live_tup AS estimated_rows,
    CASE 
        WHEN seq_scan = 0 THEN 0
        ELSE ROUND(seq_tup_read::numeric / seq_scan, 0)
    END AS avg_tuples_per_seq_scan
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > 0
  AND n_live_tup > 10000
ORDER BY seq_tup_read DESC
LIMIT 20;

-- Find unused indexes (candidates for removal)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan AS index_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- Maintenance Schedule Recommendations
-- ============================================

/*
DAILY (automated via cron or scheduler):
  - VACUUM ANALYZE on high-activity tables (posts, comments, graph_links)
  - Check bloat levels
  - Monitor table sizes

WEEKLY:
  - Full database VACUUM ANALYZE
  - Review slow query logs
  - Check index usage statistics
  - Run integrity checks (use: integrity check)

MONTHLY:
  - REINDEX on tables with significant bloat
  - Review and optimize query performance
  - Clean up orphaned data (use: integrity clean)
  - Archive old data if applicable

QUARTERLY:
  - Full database health check
  - Review database configuration
  - Plan for schema changes if needed
  - Consider VACUUM FULL for heavily bloated tables (requires downtime)

PostgreSQL Configuration Recommendations:
  - Enable auto_vacuum (should be on by default)
  - Adjust autovacuum_vacuum_scale_factor based on workload (default: 0.2)
  - Set autovacuum_analyze_scale_factor appropriately (default: 0.1)
  - Monitor pg_stat_user_tables for autovacuum activity
  - Consider increasing maintenance_work_mem for faster VACUUM operations
*/

-- ============================================
-- Backup Verification
-- ============================================

-- Check last backup time (requires custom tracking table)
-- For this project, backups are managed via docker volume and scripts
-- See: make backup-now, make backups-ls

-- Verify critical tables exist and have data
SELECT 
    'subreddits' AS table_name, COUNT(*) AS row_count FROM subreddits
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'posts', COUNT(*) FROM posts
UNION ALL
SELECT 'comments', COUNT(*) FROM comments
UNION ALL
SELECT 'graph_nodes', COUNT(*) FROM graph_nodes
UNION ALL
SELECT 'graph_links', COUNT(*) FROM graph_links;
