package cache

import (
	"time"

	"github.com/dgraph-io/ristretto"
)

// LRUCache is a size-bounded LRU cache implementation using ristretto.
type LRUCache struct {
	cache      *ristretto.Cache
	defaultTTL time.Duration
}

// cacheItem wraps the data with expiration time.
type cacheItem struct {
	data      []byte
	expiresAt time.Time
}

// NewLRU creates a new LRU cache with the given configuration.
// maxSizeMB is the maximum size of the cache in megabytes.
// maxEntries is the maximum number of entries in the cache.
// defaultTTL is the default time-to-live for cache entries.
func NewLRU(maxSizeMB int64, maxEntries int64, defaultTTL time.Duration) (*LRUCache, error) {
	// Ristretto configuration
	// NumCounters should be ~10x the number of entries for optimal performance
	numCounters := maxEntries * 10
	if numCounters < 1000 {
		numCounters = 1000
	}

	config := &ristretto.Config{
		NumCounters: numCounters,
		MaxCost:     maxSizeMB * 1024 * 1024, // Convert MB to bytes
		BufferItems: 64,                      // Number of keys per Get buffer
	}

	cache, err := ristretto.NewCache(config)
	if err != nil {
		return nil, err
	}

	return &LRUCache{
		cache:      cache,
		defaultTTL: defaultTTL,
	}, nil
}

// Get retrieves a value from the cache by key.
func (c *LRUCache) Get(key string) ([]byte, bool) {
	val, found := c.cache.Get(key)
	if !found {
		return nil, false
	}

	item, ok := val.(*cacheItem)
	if !ok {
		// Invalid item type, delete it
		c.cache.Del(key)
		return nil, false
	}

	// Check expiration
	if time.Now().After(item.expiresAt) {
		c.cache.Del(key)
		return nil, false
	}

	return item.data, true
}

// Set stores a value in the cache with the given key and TTL.
func (c *LRUCache) Set(key string, value []byte, ttl time.Duration) {
	if ttl == 0 {
		ttl = c.defaultTTL
	}

	item := &cacheItem{
		data:      value,
		expiresAt: time.Now().Add(ttl),
	}

	// Cost is the size of the data in bytes
	cost := int64(len(value))

	// Set will return false if the item could not be added (e.g., due to size limits)
	// We ignore the return value as ristretto handles eviction internally
	_ = c.cache.Set(key, item, cost)
	
	// Wait for value to pass through buffers (recommended by ristretto docs)
	c.cache.Wait()
}

// Delete removes a value from the cache.
func (c *LRUCache) Delete(key string) {
	c.cache.Del(key)
}

// Clear removes all values from the cache.
func (c *LRUCache) Clear() {
	c.cache.Clear()
}

// Stats returns cache statistics.
func (c *LRUCache) Stats() Stats {
	metrics := c.cache.Metrics

	return Stats{
		Hits:      metrics.Hits(),
		Misses:    metrics.Misses(),
		KeysAdded: metrics.KeysAdded(),
		Evictions: metrics.KeysEvicted(),
		Size:      int64(metrics.CostAdded() - metrics.CostEvicted()), // Approximate current size
		Items:     int64(metrics.KeysAdded() - metrics.KeysEvicted()),
	}
}

// Close closes the cache and releases resources.
func (c *LRUCache) Close() {
	c.cache.Close()
}
