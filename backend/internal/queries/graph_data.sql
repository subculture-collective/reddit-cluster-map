-- name: GetGraphData :many
WITH subreddit_nodes AS (
    SELECT 
        'subreddit_' || id as id,
        name,
        subscriber_count as val,
        'subreddit' as type
    FROM subreddits
),
user_nodes AS (
    SELECT 
        'user_' || id as id,
        username as name,
        comment_count + post_count as val,
        'user' as type
    FROM users
),
subreddit_links AS (
    SELECT 
        'subreddit_' || s1.id as source,
        'subreddit_' || s2.id as target
    FROM subreddit_relationships sr
    JOIN subreddits s1 ON sr.source_subreddit_id = s1.id
    JOIN subreddits s2 ON sr.target_subreddit_id = s2.id
    WHERE sr.overlap_count > 0
),
user_subreddit_links AS (
    SELECT 
        'user_' || u.id as source,
        'subreddit_' || s.id as target
    FROM user_subreddit_activity usa
    JOIN users u ON usa.user_id = u.id
    JOIN subreddits s ON usa.subreddit_id = s.id
    WHERE usa.activity_count > 0
)
SELECT 
    json_build_object(
        'nodes', (
            SELECT json_agg(nodes)
            FROM (
                SELECT * FROM subreddit_nodes
                UNION ALL
                SELECT * FROM user_nodes
            ) nodes
        ),
        'links', (
            SELECT json_agg(links)
            FROM (
                SELECT * FROM subreddit_links
                UNION ALL
                SELECT * FROM user_subreddit_links
            ) links
        )
    ) as graph_data; 