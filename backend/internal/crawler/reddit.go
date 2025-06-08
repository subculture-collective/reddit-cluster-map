package crawler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
)

// SubredditInfo holds metadata about a subreddit
type SubredditInfo struct {
	Title       string `json:"title"`
	Description string `json:"public_description"`
	Subscribers int    `json:"subscribers"`
}

// FetchUserSubredditsConfig holds configurable options for subreddit discovery.
type FetchUserSubredditsConfig struct {
	Limit      int
	MaxEnqueue int
	Enabled    bool
}

// Post holds relevant post data from the Reddit API
type Post struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Author     string    `json:"author"`
	Permalink  string    `json:"permalink"`
	Score      int       `json:"score"`
	URL        string    `json:"url"`
	Flair      string    `json:"link_flair_text"`
	CreatedAt  time.Time `json:"created_at"`
	IsSelf     bool      `json:"is_self"`
}

// Comment holds comment data from a Reddit thread
type Comment struct {
	ID        string    `json:"id"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	ParentID  string    `json:"parent_id"`
	Depth     int       `json:"depth"`
}


var seenUsers = struct {
	m map[string]bool
	sync.Mutex
}{m: make(map[string]bool)}

var subredditMentionRegex = regexp.MustCompile(`(?i)/r/([a-zA-Z0-9_]+)`)

func authenticatedGet(url string) (*http.Response, error) {
	waitForRateLimit() // <--- throttle all Reddit API calls

	token, err := getAccessToken()
	if err != nil {
		log.Printf("⚠️ Failed to get access token: %v", err)
		return nil, err
	}

	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "reddit-cluster-map/0.1")

	return http.DefaultClient.Do(req)
}

func CrawlSubreddit(subreddit string) (*SubredditInfo, []Post, error) {
	subreddit = strings.ToLower(strings.TrimSpace(subreddit))

	aboutURL := fmt.Sprintf("https://oauth.reddit.com/r/%s/about", subreddit)
	resp, err := authenticatedGet(aboutURL)
	if err != nil {
		log.Printf("⚠️ Failed to fetch subreddit %s: %v", subreddit, err)
		return nil, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("⚠️ Non-200 status for subreddit %s: %d", subreddit, resp.StatusCode)
		return nil, nil, fmt.Errorf("failed to fetch subreddit: %s", resp.Status)
	}

	var aboutWrapper struct {
		Data SubredditInfo `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&aboutWrapper); err != nil {
		log.Printf("⚠️ Failed to decode subreddit %s response: %v", subreddit, err)
		return nil, nil, err
	}

	// Get the target number of posts from environment
	targetPosts := utils.GetEnvAsInt("MAX_POSTS_PER_SUB", 25)
	var allPosts []Post
	var after string

	// Keep fetching posts until we reach the target or run out of posts
	for len(allPosts) < targetPosts {
		// Reddit API has a maximum limit of 100 per request
		limit := 100
		postsURL := fmt.Sprintf("https://oauth.reddit.com/r/%s/new?limit=%d", subreddit, limit)
		if after != "" {
			postsURL += "&after=" + after
		}

		resp, err = authenticatedGet(postsURL)
		if err != nil {
			log.Printf("⚠️ Failed to fetch posts for subreddit %s: %v", subreddit, err)
			return &aboutWrapper.Data, allPosts, err
		}

		var postsWrapper struct {
			Data struct {
				Children []struct {
					Data Post `json:"data"`
				} `json:"children"`
				After string `json:"after"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&postsWrapper); err != nil {
			log.Printf("⚠️ Failed to decode posts for subreddit %s: %v", subreddit, err)
			return &aboutWrapper.Data, allPosts, err
		}
		resp.Body.Close()

		// Add new posts to our collection
		for _, child := range postsWrapper.Data.Children {
			allPosts = append(allPosts, child.Data)
			if len(allPosts) >= targetPosts {
				break
			}
		}

		// If no more posts or no after token, we're done
		if postsWrapper.Data.After == "" || len(postsWrapper.Data.Children) == 0 {
			break
		}
		after = postsWrapper.Data.After

		// Be nice to Reddit's API
		time.Sleep(1 * time.Second)
	}

	log.Printf("📥 Fetched %d posts from r/%s", len(allPosts), subreddit)
	return &aboutWrapper.Data, allPosts, nil
}


func extractMentionedSubreddits(posts []Post) []string {
	found := make(map[string]struct{})

	for _, post := range posts {
		matches := subredditMentionRegex.FindAllStringSubmatch(post.Title, -1)
		for _, m := range matches {
			found[m[1]] = struct{}{}
		}
	}

	var results []string
	for k := range found {
		results = append(results, k)
	}
	return results
}

func CrawlComments(postID string) ([]Comment, error) {
	limit := utils.GetEnvAsInt("MAX_COMMENTS_PER_POST", 100)
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

	comments := parseComments(children, 0)
	log.Printf("🧮 Total parsed comments for post %s: %d", postID, len(comments))
	return comments, nil
}

// ShouldFetchForUser checks if a user has already been processed.
func ShouldFetchForUser(username string) bool {
	seenUsers.Lock()
	defer seenUsers.Unlock()
	if seenUsers.m[username] {
		return false
	}
	seenUsers.m[username] = true
	return true
}

func FetchAndQueueUserSubreddits(ctx context.Context, q *db.Queries, username string, config FetchUserSubredditsConfig) {
	if !config.Enabled || !ShouldFetchForUser(username) {
		return
	}

	subs, err := FetchRecentUserSubreddits(username, config.Limit)
	if err != nil {
		log.Printf("⚠️ Failed to fetch subs for u/%s: %v", username, err)
		return
	}

	shuffled := utils.ShuffleStrings(subs)
	count := 0

	for _, sub := range shuffled {
		exists, err := q.CrawlJobExists(ctx, sub)
		if err != nil {
			log.Printf("⚠️ Failed to check if job exists for r/%s: %v", sub, err)
			continue
		}
		if exists {
			continue
		}

		if err := q.EnqueueCrawlJob(ctx, sub); err == nil {
			
			count++
			if count >= config.MaxEnqueue {
				break
			}
		}
	}

	log.Printf("📬 Enqueued %d new subs from u/%s", count, username)
}

// FetchAndQueueUserSubredditsForAuthors processes a list of authors and queues subs for each.
func FetchAndQueueUserSubredditsForAuthors(ctx context.Context, q *db.Queries, authors []string, config FetchUserSubredditsConfig) {
	for _, author := range authors {
		FetchAndQueueUserSubreddits(ctx, q, author, config)
	}
}

// parseComments recursively extracts comments from Reddit's JSON structure.
func parseComments(children []interface{}, depth int) []Comment {
	var comments []Comment

	for _, c := range children {
		// Skip placeholder "more" nodes
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

		// log.Printf("🧩 Processing comment ID=%s, author=%s", id, author)

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

		// Recursively parse replies
		if repliesRaw, ok := data["replies"]; ok {
			if repliesMap, ok := repliesRaw.(map[string]interface{}); ok {
				if repliesData, ok := repliesMap["data"].(map[string]interface{}); ok {
					if nestedChildren, ok := repliesData["children"].([]interface{}); ok {
						nested := parseComments(nestedChildren, depth+1)
						comments = append(comments, nested...)
					}
				}
			}
		}
	}

	return comments
}

