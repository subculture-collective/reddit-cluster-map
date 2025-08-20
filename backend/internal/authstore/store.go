package authstore

import (
	"context"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// Account is a minimal representation of a stored OAuth account.
type Account struct {
    RedditUserID   string
    RedditUsername string
    AccessToken    string
    RefreshToken   string
    ExpiresAt      time.Time
    Scopes         string
}

// Store wraps db.Queries for OAuth account persistence.
type Store struct{ q *db.Queries }

func New(q *db.Queries) *Store { return &Store{q: q} }

// Upsert saves/updates an OAuth account using raw SQL to avoid needing regenerated sqlc code.
func (s *Store) Upsert(ctx context.Context, redditUserID, username, accessToken, refreshToken, scopes string, expiresAt time.Time) (Account, error) {
    const stmt = `
        INSERT INTO oauth_accounts (reddit_user_id, reddit_username, access_token, refresh_token, expires_at, scopes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (reddit_user_id) DO UPDATE SET
          reddit_username = EXCLUDED.reddit_username,
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          scopes = EXCLUDED.scopes,
          updated_at = now()
        RETURNING reddit_user_id, reddit_username, access_token, refresh_token, expires_at, scopes;
    `
    row := s.q.DB().QueryRowContext(ctx, stmt, redditUserID, username, accessToken, refreshToken, expiresAt, scopes)
    var a Account
    if err := row.Scan(&a.RedditUserID, &a.RedditUsername, &a.AccessToken, &a.RefreshToken, &a.ExpiresAt, &a.Scopes); err != nil {
        return Account{}, err
    }
    return a, nil
}

func (s *Store) ByUserID(ctx context.Context, redditUserID string) (Account, error) {
    const qstr = `SELECT reddit_user_id, reddit_username, access_token, refresh_token, expires_at, scopes FROM oauth_accounts WHERE reddit_user_id = $1`
    row := s.q.DB().QueryRowContext(ctx, qstr, redditUserID)
    var a Account
    if err := row.Scan(&a.RedditUserID, &a.RedditUsername, &a.AccessToken, &a.RefreshToken, &a.ExpiresAt, &a.Scopes); err != nil {
        return Account{}, err
    }
    return a, nil
}

func (s *Store) ByUsername(ctx context.Context, username string) (Account, error) {
    const qstr = `SELECT reddit_user_id, reddit_username, access_token, refresh_token, expires_at, scopes FROM oauth_accounts WHERE reddit_username = $1`
    row := s.q.DB().QueryRowContext(ctx, qstr, username)
    var a Account
    if err := row.Scan(&a.RedditUserID, &a.RedditUsername, &a.AccessToken, &a.RefreshToken, &a.ExpiresAt, &a.Scopes); err != nil {
        return Account{}, err
    }
    return a, nil
}
