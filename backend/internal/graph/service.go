package graph

import (
	"context"
	"fmt"

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
		var score sql.NullInt32
		if post.Score.Valid {
			score = post.Score
		}
		err := s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   post.ID,
			Name: post.Title,
			Val:  score,
			Type: sql.NullString{String: "post", Valid: true},
		})
		if err != nil {
			return fmt.Errorf("failed to insert post node: %w", err)
		}
	}

	// Insert comment nodes
	for _, comment := range comments {
		var score sql.NullInt32
		if comment.Score.Valid {
			score = comment.Score
		}
		err := s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   comment.ID,
			Name: comment.Body,
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