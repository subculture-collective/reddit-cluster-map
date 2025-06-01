package crawler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var accessToken string
var tokenExpiry time.Time

func getAccessToken() (string, error) {
	if accessToken != "" && time.Now().Before(tokenExpiry) {
		return accessToken, nil
	}

	clientID := os.Getenv("REDDIT_CLIENT_ID")
	clientSecret := os.Getenv("REDDIT_CLIENT_SECRET")

	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("REDDIT_CLIENT_ID or SECRET not set")
	}

	data := url.Values{}
	data.Set("grant_type", "client_credentials")

	req, _ := http.NewRequest("POST", "https://www.reddit.com/api/v1/access_token", strings.NewReader(data.Encode()))
	req.SetBasicAuth(clientID, clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "reddit-cluster-map/0.1")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("⚠️ Failed to request access token: %v", err)
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("⚠️ Token request failed: %s", resp.Status)
		return "", fmt.Errorf("token request failed: %s", resp.Status)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		log.Printf("⚠️ Failed to decode token response: %v", err)
		return "", err
	}

	accessToken = tokenResp.AccessToken
	tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn-60) * time.Second) // Renew 1 min early

	return accessToken, nil
}
