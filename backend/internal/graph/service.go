package graph

import (
	"context"
	"fmt"
	"strconv"

	"database/sql"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

type Service struct {
	queries *db.Queries
}

func NewService(queries *db.Queries) *Service {
	return &Service{
		queries: queries,
	}
}

// PrecalculateGraphData precalculates the graph data and stores it in the database.
func (s *Service) PrecalculateGraphData(ctx context.Context) error {
	// Fetch all posts and comments
	posts, err := s.queries.GetAllPosts(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch posts: %w", err)
	}

	comments, err := s.queries.GetAllComments(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch comments: %w", err)
	}

	// Clear existing graph data
	if err := s.queries.ClearGraphTables(ctx); err != nil {
		return fmt.Errorf("failed to clear graph tables: %w", err)
	}

	// Insert post nodes
	for _, post := range posts {
		var score sql.NullString
		if post.Score.Valid {
			score = sql.NullString{String: strconv.Itoa(int(post.Score.Int32)), Valid: true}
		}
		var title string
		if post.Title.Valid {
			title = post.Title.String
		}
		err := s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   post.ID,
			Name: title,
			Val:  score,
			Type: sql.NullString{String: "post", Valid: true},
		})
		if err != nil {
			return fmt.Errorf("failed to insert post node: %w", err)
		}
	}

	// Insert comment nodes
	for _, comment := range comments {
		var score sql.NullString
		if comment.Score.Valid {
			score = sql.NullString{String: strconv.Itoa(int(comment.Score.Int32)), Valid: true}
		}
		var body string
		if comment.Body.Valid {
			body = comment.Body.String
		}
		err := s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   comment.ID,
			Name: body,
			Val:  score,
			Type: sql.NullString{String: "comment", Valid: true},
		})
		if err != nil {
			return fmt.Errorf("failed to insert comment node: %w", err)
		}
	}

	// Insert links (e.g., comment to post)
	for _, comment := range comments {
		err := s.queries.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
			Source: comment.ID,
			Target: comment.PostID,
		})
		if err != nil {
			return fmt.Errorf("failed to insert link: %w", err)
		}
	}

	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
} 