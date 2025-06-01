package crawler

import (
	"strings"
	"sync"
)

type CrawlerQueue struct {
	mu      sync.Mutex
	queue   []string
	visited map[string]bool
}

func NewCrawlerQueue(seed []string) *CrawlerQueue {
	v := make(map[string]bool)
	for _, s := range seed {
		v[strings.ToLower(s)] = true
	}

	return &CrawlerQueue{
		queue:   seed,
		visited: v,
	}
}

func (cq *CrawlerQueue) Next() (string, bool) {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	if len(cq.queue) == 0 {
		return "", false
	}

	subreddit := cq.queue[0]
	cq.queue = cq.queue[1:]
	return subreddit, true
}

func (cq *CrawlerQueue) Add(sub string) {
	cq.mu.Lock()
	defer cq.mu.Unlock()

	sub = strings.ToLower(sub)
	if !cq.visited[sub] {
		cq.visited[sub] = true
		cq.queue = append(cq.queue, sub)
	}
}
