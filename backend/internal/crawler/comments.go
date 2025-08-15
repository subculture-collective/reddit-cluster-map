package crawler

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
)

// Comment holds comment data from a Reddit thread
type Comment struct {
	ID        string    `json:"id"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	ParentID  string    `json:"parent_id"`
	Depth     int       `json:"depth"`
	Score     int       `json:"score"`
}

func CrawlComments(postID string) ([]Comment, error) {
	limit := utils.GetEnvAsInt("MAX_COMMENTS_PER_POST", 100)
	maxDepth := utils.GetEnvAsInt("MAX_COMMENT_DEPTH", 4)
	url := fmt.Sprintf("https://oauth.reddit.com/comments/%s?limit=%d", postID, limit)

	resp, err := authenticatedGet(url)
	if err != nil {
		log.Printf("⚠️ Failed to fetch comments for post %s: %v", postID, err)
		return nil, err
	}
	defer resp.Body.Close()

	var data []interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		log.Printf("⚠️ Failed to decode comments for post %s: %v", postID, err)
		return nil, err
	}

	if len(data) < 2 {
		return nil, fmt.Errorf("unexpected comments response")
	}

	commentData := data[1].(map[string]interface{})["data"].(map[string]interface{})
	children := commentData["children"].([]interface{})

	comments := parseCommentsWithLimit(children, 0, maxDepth)
	log.Printf("🧮 Total parsed comments for post %s: %d", postID, len(comments))
	return comments, nil
}

func parseCommentsWithLimit(children []interface{}, depth int, maxDepth int) []Comment {
	if depth > maxDepth {
		return nil
	}
	var comments []Comment
	for _, c := range children {
		kind, ok := c.(map[string]interface{})["kind"].(string)
		if !ok || kind != "t1" {
			continue
		}
		data, ok := c.(map[string]interface{})["data"].(map[string]interface{})
		if !ok {
			continue
		}
		author, _ := data["author"].(string)
		body, _ := data["body"].(string)
		id, _ := data["id"].(string)
		parentID, _ := data["parent_id"].(string)
		if utils.IsValidAuthor(author) && body != "" {
			var created time.Time
			if createdUTC, ok := data["created_utc"].(float64); ok {
				created = time.Unix(int64(createdUTC), 0)
			} else {
				created = time.Now()
			}
			comments = append(comments, Comment{
				ID:        id,
				Author:    author,
				Body:      body,
				Depth:     depth,
				ParentID:  parentID,
				CreatedAt: created,
			})
		}
		if repliesRaw, ok := data["replies"]; ok {
			if repliesMap, ok := repliesRaw.(map[string]interface{}); ok {
				if repliesData, ok := repliesMap["data"].(map[string]interface{}); ok {
					if nestedChildren, ok := repliesData["children"].([]interface{}); ok {
						nested := parseCommentsWithLimit(nestedChildren, depth+1, maxDepth)
						comments = append(comments, nested...)
					}
				}
			}
		}
	}
	return comments
}
