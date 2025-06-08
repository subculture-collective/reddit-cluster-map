package graph

import (
	"context"
	"fmt"
	"log"
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

// CalculateSubredditRelationships calculates relationships between subreddits based on user overlap
func (s *Service) CalculateSubredditRelationships(ctx context.Context) error {
	log.Printf("🔄 Starting subreddit relationship calculation")
	
	// Clear existing relationships
	if err := s.queries.ClearSubredditRelationships(ctx); err != nil {
		return fmt.Errorf("failed to clear subreddit relationships: %w", err)
	}
	log.Printf("🧹 Cleared existing subreddit relationships")

	// Get all subreddits
	subreddits, err := s.queries.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("📊 Processing %d subreddits for relationships", len(subreddits))

	// For each pair of subreddits, calculate user overlap
	relationshipCount := 0
	for i, s1 := range subreddits {
		for j := i + 1; j < len(subreddits); j++ {
			s2 := subreddits[j]
			
			// Get users who posted/commented in both subreddits
			overlap, err := s.queries.GetSubredditOverlap(ctx, db.GetSubredditOverlapParams{
				SubredditID:   s1.ID,
				SubredditID_2: s2.ID,
			})
			if err != nil {
				log.Printf("⚠️ Failed to calculate overlap between r/%s and r/%s: %v", s1.Name, s2.Name, err)
				continue
			}

			if overlap > 0 {
				// Insert relationship in both directions
				_, err := s.queries.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{
					SourceSubredditID: s1.ID,
					TargetSubredditID: s2.ID,
					OverlapCount:      int32(overlap),
				})
				if err != nil {
					log.Printf("⚠️ Failed to create relationship from r/%s to r/%s: %v", s1.Name, s2.Name, err)
					continue
				}

				_, err = s.queries.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{
					SourceSubredditID: s2.ID,
					TargetSubredditID: s1.ID,
					OverlapCount:      int32(overlap),
				})
				if err != nil {
					log.Printf("⚠️ Failed to create relationship from r/%s to r/%s: %v", s2.Name, s1.Name, err)
					continue
				}
				relationshipCount++
			}
		}
	}
	log.Printf("✅ Created %d subreddit relationships", relationshipCount)
	return nil
}

// CalculateUserActivity calculates user activity in subreddits
func (s *Service) CalculateUserActivity(ctx context.Context) error {
	log.Printf("🔄 Starting user activity calculation")
	
	// Clear existing activity data
	if err := s.queries.ClearUserSubredditActivity(ctx); err != nil {
		return fmt.Errorf("failed to clear user activity: %w", err)
	}
	log.Printf("🧹 Cleared existing user activity data")

	// Get all users
	users, err := s.queries.GetAllUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch users: %w", err)
	}
	log.Printf("👥 Processing activity for %d users", len(users))

	activityCount := 0
	// For each user, calculate their activity in each subreddit
	for _, user := range users {
		// Get all subreddits where the user has posted or commented
		subreddits, err := s.queries.GetUserSubreddits(ctx, user.ID)
		if err != nil {
			log.Printf("⚠️ Failed to get subreddits for user %s: %v", user.Username, err)
			continue
		}

		for _, subreddit := range subreddits {
			// Calculate total activity (posts + comments)
			activity, err := s.queries.GetUserSubredditActivityCount(ctx, db.GetUserSubredditActivityCountParams{
				AuthorID:    user.ID,
				SubredditID: subreddit.ID,
			})
			if err != nil {
				log.Printf("⚠️ Failed to calculate activity for user %s in r/%s: %v", user.Username, subreddit.Name, err)
				continue
			}

			if activity > 0 {
				_, err := s.queries.CreateUserSubredditActivity(ctx, db.CreateUserSubredditActivityParams{
					UserID:        user.ID,
					SubredditID:   subreddit.ID,
					ActivityCount: activity,
				})
				if err != nil {
					log.Printf("⚠️ Failed to create activity record for user %s in r/%s: %v", user.Username, subreddit.Name, err)
					continue
				}
				activityCount++
			}
		}
	}
	log.Printf("✅ Created %d user activity records", activityCount)
	return nil
}

// PrecalculateGraphData precalculates the graph data and stores it in the database.
func (s *Service) PrecalculateGraphData(ctx context.Context) error {
	log.Printf("🔄 Starting graph data precalculation")
	
	// First calculate relationships and activity
	if err := s.CalculateSubredditRelationships(ctx); err != nil {
		return fmt.Errorf("failed to calculate subreddit relationships: %w", err)
	}

	if err := s.CalculateUserActivity(ctx); err != nil {
		return fmt.Errorf("failed to calculate user activity: %w", err)
	}

	// Clear existing graph data
	if err := s.queries.ClearGraphTables(ctx); err != nil {
		return fmt.Errorf("failed to clear graph tables: %w", err)
	}
	log.Printf("🧹 Cleared existing graph data")

	// Get all subreddits and create nodes
	subreddits, err := s.queries.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("📊 Creating nodes for %d subreddits", len(subreddits))

	subredditNodeCount := 0
	for _, subreddit := range subreddits {
		var subscribers sql.NullString
		if subreddit.Subscribers.Valid {
			subscribers = sql.NullString{String: strconv.FormatInt(int64(subreddit.Subscribers.Int32), 10), Valid: true}
		}
		err := s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   fmt.Sprintf("subreddit_%d", subreddit.ID),
			Name: subreddit.Name,
			Val:  subscribers,
			Type: sql.NullString{String: "subreddit", Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert subreddit node for r/%s: %v", subreddit.Name, err)
			continue
		}
		subredditNodeCount++
	}
	log.Printf("✅ Created %d subreddit nodes", subredditNodeCount)

	// Get all users and create nodes
	users, err := s.queries.GetAllUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch users: %w", err)
	}
	log.Printf("👥 Creating nodes for %d users", len(users))

	userNodeCount := 0
	for _, user := range users {
		// Calculate total activity
		activity, err := s.queries.GetUserTotalActivity(ctx, user.ID)
		if err != nil {
			log.Printf("⚠️ Failed to calculate total activity for user %s: %v", user.Username, err)
			continue
		}

		err = s.queries.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   fmt.Sprintf("user_%d", user.ID),
			Name: user.Username,
			Val:  sql.NullString{String: strconv.FormatInt(int64(activity), 10), Valid: true},
			Type: sql.NullString{String: "user", Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert user node for %s: %v", user.Username, err)
			continue
		}
		userNodeCount++
	}
	log.Printf("✅ Created %d user nodes", userNodeCount)

	// Create links for subreddit relationships
	relationships, err := s.queries.GetAllSubredditRelationships(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch relationships: %w", err)
	}
	log.Printf("🔗 Creating %d subreddit relationship links", len(relationships))

	relationshipLinkCount := 0
	for _, rel := range relationships {
		err := s.queries.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
			Source: fmt.Sprintf("subreddit_%d", rel.SourceSubredditID),
			Target: fmt.Sprintf("subreddit_%d", rel.TargetSubredditID),
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert relationship link: %v", err)
			continue
		}
		relationshipLinkCount++
	}
	log.Printf("✅ Created %d subreddit relationship links", relationshipLinkCount)

	// Create links for user activity
	activities, err := s.queries.GetAllUserSubredditActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch activities: %w", err)
	}
	log.Printf("🔗 Creating %d user activity links", len(activities))

	activityLinkCount := 0
	for _, activity := range activities {
		err := s.queries.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
			Source: fmt.Sprintf("user_%d", activity.UserID),
			Target: fmt.Sprintf("subreddit_%d", activity.SubredditID),
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert activity link: %v", err)
			continue
		}
		activityLinkCount++
	}
	log.Printf("✅ Created %d user activity links", activityLinkCount)
	log.Printf("🎉 Graph data precalculation completed successfully")
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
} 