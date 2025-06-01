package crawler

import (
	"database/sql"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// ToInsertPostParams converts a Post into InsertPostParams.
func ToInsertPostParams(p Post, s string) db.InsertPostParams {
	return db.InsertPostParams{
		ID:        p.ID,
		Author:    p.Author,
		Subreddit: s,
		Title:     sql.NullString{String: p.Title, Valid: p.Title != ""},
		Permalink: sql.NullString{String: p.Permalink, Valid: p.Permalink != ""},
		Score:     sql.NullInt32{Int32: int32(p.Score), Valid: p.Score >= 0},
		Flair:     sql.NullString{String: p.Flair, Valid: p.Flair != ""},
		Url:       sql.NullString{String: p.URL, Valid: p.URL != ""},
		IsSelf:    sql.NullBool{Bool: p.IsSelf, Valid: true},
		CreatedAt: sql.NullTime{Time: p.CreatedAt, Valid: !p.CreatedAt.IsZero()},
	}
}

// ToInsertCommentParams converts a Comment into InsertCommentParams.
func ToInsertCommentParams(c Comment, postID, sub string) db.InsertCommentParams {
	return db.InsertCommentParams{
		ID:        c.ID,
		PostID:    postID,
		Author:    c.Author,
		Subreddit: sub,
		Body:      sql.NullString{String: c.Body, Valid: c.Body != ""},
		CreatedAt: sql.NullTime{Time: c.CreatedAt, Valid: !c.CreatedAt.IsZero()},
		ParentID:  sql.NullString{String: c.ParentID, Valid: c.ParentID != ""},
	}
}

// ToUpsertPostParams converts a Post into UpsertPostParams.
func ToUpsertPostParams(p Post, sub string) db.UpsertPostParams {
	return db.UpsertPostParams{
		ID:        p.ID,
		Author:    p.Author,
		Subreddit: sub,
		Title:     sql.NullString{String: p.Title, Valid: p.Title != ""},
		Permalink: sql.NullString{String: p.Permalink, Valid: p.Permalink != ""},
		Score:     sql.NullInt32{Int32: int32(p.Score), Valid: true},
		Flair:     sql.NullString{String: p.Flair, Valid: p.Flair != ""},
		Url:       sql.NullString{String: p.URL, Valid: p.URL != ""},
		IsSelf:    sql.NullBool{Bool: p.IsSelf, Valid: true},
		CreatedAt: sql.NullTime{Time: p.CreatedAt, Valid: !p.CreatedAt.IsZero()},
	}
}