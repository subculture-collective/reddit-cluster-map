package crawler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
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
	CreatedUTC float64   `json:"created_utc"`
	CreatedAt  time.Time `json:"-"`
	IsSelf     bool      `json:"is_self"`
	Selftext   string    `json:"selftext"`
}

var subredditMentionRegex = regexp.MustCompile(`(?i)/r/([a-zA-Z0-9_]+)`)

func CrawlSubreddit(subreddit string) (*SubredditInfo, []Post, error) {
	subreddit = strings.ToLower(strings.TrimSpace(subreddit))

	aboutURL := fmt.Sprintf("https://oauth.reddit.com/r/%s/about", subreddit)
	resp, err := authenticatedGet(aboutURL)
	if err != nil {
		log.Printf("⚠️ Failed to fetch subreddit %s: %v", subreddit, err)
		return nil, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
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

	// Get targets and filters from centralized config
	cfg := config.Load()
	targetPosts := cfg.MaxPostsPerSub
	sortMode := cfg.PostsSort         // top, hot, new, rising
	timeFilter := cfg.PostsTimeFilter // hour, day, week, month, year, all (for top)
	var allPosts []Post
	var after string

	// Keep fetching posts until we reach the target or run out of posts
	for len(allPosts) < targetPosts {
		remaining := targetPosts - len(allPosts)
		if remaining <= 0 {
			break
		}
		limit := remaining
		if limit > 100 {
			limit = 100
		}
		base := fmt.Sprintf("https://oauth.reddit.com/r/%s/%s?limit=%d", subreddit, sortMode, limit)
		if sortMode == "top" || sortMode == "controversial" {
			base += "&t=" + timeFilter
		}
		postsURL := base
		if after != "" {
			postsURL += "&after=" + after
		}

		resp, err = authenticatedGet(postsURL)
		if err != nil {
			log.Printf("⚠️ Failed to fetch posts for subreddit %s: %v", subreddit, err)
			return &aboutWrapper.Data, allPosts, err
		}
		if resp.StatusCode != http.StatusOK {
			log.Printf("⚠️ Non-200 status for posts r/%s: %d", subreddit, resp.StatusCode)
			resp.Body.Close()
			return &aboutWrapper.Data, allPosts, fmt.Errorf("failed to fetch posts: %s", resp.Status)
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

		for _, child := range postsWrapper.Data.Children {
			p := child.Data
			if p.CreatedUTC > 0 {
				p.CreatedAt = time.Unix(int64(p.CreatedUTC), 0)
			}
			allPosts = append(allPosts, p)
			if len(allPosts) >= targetPosts {
				break
			}
		}

		if postsWrapper.Data.After == "" || len(postsWrapper.Data.Children) == 0 {
			break
		}
		after = postsWrapper.Data.After

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
		if post.Selftext != "" {
			matches = subredditMentionRegex.FindAllStringSubmatch(post.Selftext, -1)
			for _, m := range matches {
				found[m[1]] = struct{}{}
			}
		}
	}

	var results []string
	for k := range found {
		results = append(results, k)
	}
	return results
}
