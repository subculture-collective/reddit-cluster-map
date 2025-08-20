-- name: UpsertOAuthAccount :one
INSERT INTO oauth_accounts (reddit_user_id, reddit_username, access_token, refresh_token, expires_at, scopes)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (reddit_user_id) DO UPDATE SET
  reddit_username = EXCLUDED.reddit_username,
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  expires_at = EXCLUDED.expires_at,
  scopes = EXCLUDED.scopes,
  updated_at = now()
RETURNING *;

-- name: GetOAuthAccountByUserID :one
SELECT * FROM oauth_accounts WHERE reddit_user_id = $1;

-- name: GetOAuthAccountByUsername :one
SELECT * FROM oauth_accounts WHERE reddit_username = $1;
