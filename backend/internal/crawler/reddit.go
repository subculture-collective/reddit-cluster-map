package crawler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// SubredditInfo holds metadata about a subreddit
type SubredditInfo struct {
	Title       string `json:"title"`
	Description string `json:"public_description"`
	Subscribers int    `json:"subscribers"`
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

	postsURL := fmt.Sprintf("https://oauth.reddit.com/r/%s/new?limit=25", subreddit)
	resp, err = authenticatedGet(postsURL)
	if err != nil {
		log.Printf("⚠️ Failed to fetch posts for subreddit %s: %v", subreddit, err)
		return &aboutWrapper.Data, nil, err
	}
	defer resp.Body.Close()

	var postsWrapper struct {
		Data struct {
			Children []struct {
				Data Post `json:"data"`
			} `json:"children"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&postsWrapper); err != nil {
		log.Printf("⚠️ Failed to decode posts for subreddit %s: %v", subreddit, err)
		return &aboutWrapper.Data, nil, err
	}

	posts := make([]Post, len(postsWrapper.Data.Children))
	for i, child := range postsWrapper.Data.Children {
		posts[i] = child.Data
	}

	return &aboutWrapper.Data, posts, nil
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
	url := fmt.Sprintf("https://oauth.reddit.com/comments/%s?limit=100", postID)

	resp, err := authenticatedGet(url)
	if err != nil {
		log.Printf("⚠️ Failed to fetch comments for post %s: %v", postID, err)
		return nil, err
	}
	defer resp.Body.Close()

	var data []any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		log.Printf("⚠️ Failed to decode comments for post %s: %v", postID, err)
		return nil, err
	}

	if len(data) < 2 {
		return nil, fmt.Errorf("unexpected comments response")
	}

	commentData := data[1].(map[string]interface{})["data"].(map[string]interface{})
	children := commentData["children"].([]interface{})

	var comments []Comment
	for _, c := range children {
		child := c.(map[string]interface{})["data"].(map[string]interface{})
		author, _ := child["author"].(string)
		body, _ := child["body"].(string)

		if author != "" && author != "[deleted]" && body != "" {
			comments = append(comments, Comment{
				Author: author,
				Body:   body,
			})
		}
	}

	return comments, nil
}
