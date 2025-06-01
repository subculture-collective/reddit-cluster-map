package crawler

import (
	"encoding/json"
	"fmt"
	"log"
)

type redditListing struct {
	Data struct {
		Children []struct {
			Data struct {
				Subreddit string `json:"subreddit"`
			} `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

func FetchUserSubreddits(username string, limit int) ([]string, error) {
	endpoints := []string{
		fmt.Sprintf("https://oauth.reddit.com/user/%s/submitted.json?limit=%d", username, limit),
		fmt.Sprintf("https://oauth.reddit.com/user/%s/comments.json?limit=%d", username, limit),
	}

	subreddits := make(map[string]bool)

	for _, url := range endpoints {
		resp, err := authenticatedGet(url)
		if err != nil {
			log.Printf("⚠️ Failed to fetch %s: %v", url, err)
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			log.Printf("⚠️ Non-200 status for %s: %d", url, resp.StatusCode)
			continue
		}

		var parsed struct {
			Data struct {
				Children []struct {
					Data struct {
						Subreddit string `json:"subreddit"`
					} `json:"data"`
				} `json:"children"`
			} `json:"data"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
			log.Printf("⚠️ Failed to decode JSON from %s: %v", url, err)
			continue
		}

		for _, child := range parsed.Data.Children {
			if sub := child.Data.Subreddit; sub != "" {
				subreddits[sub] = true
			}
		}
	}

	var results []string
	for sub := range subreddits {
		results = append(results, sub)
	}
	return results, nil
}


// FetchRecentUserSubreddits fetches the list of subreddits a user has recently posted or commented in.
func FetchRecentUserSubreddits(username string, limit int) ([]string, error) {
	url := fmt.Sprintf("https://www.reddit.com/user/%s/.json?limit=%d", username, limit)
	resp, err := authenticatedGet(url)
	if err != nil {
		log.Printf("⚠️ Failed to fetch user subs for %s: %v", username, err)
		return nil, err
	}
	defer resp.Body.Close()

	var parsed struct {
		Data struct {
			Children []struct {
				Data struct {
					Subreddit string `json:"subreddit"`
				} `json:"data"`
			} `json:"children"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	var subs []string
	for _, item := range parsed.Data.Children {
		sub := item.Data.Subreddit
		if sub != "" && !seen[sub] {
			subs = append(subs, sub)
			seen[sub] = true
		}
	}

	return subs, nil
}