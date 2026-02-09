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
// maxEntries influences the internal counter size but does not strictly limit entry count.
// Ristretto uses cost-based eviction, so the actual number of entries depends on their sizes.
// defaultTTL is the default time-to-live for cache entries.
func NewLRU(maxSizeMB int64, maxEntries int64, defaultTTL time.Duration) (*LRUCache, error) {
	// Ristretto configuration
	// NumCounters should be ~10x the expected number of entries for optimal performance
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
// Note: Ristretto's Set is asynchronous. The value may not be immediately available
// for retrieval. This is acceptable in production use where eventual consistency is fine.
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
// Note: Size and Items are approximations based on cumulative metrics and may not be exact
// after cache clears or counter rollovers.
func (c *LRUCache) Stats() Stats {
	metrics := c.cache.Metrics

	// Calculate current size/items by subtracting evicted from added
	// Cast to int64 for safe subtraction (values should never be negative in practice)
	costAdded := int64(metrics.CostAdded())
	costEvicted := int64(metrics.CostEvicted())
	keysAdded := int64(metrics.KeysAdded())
	keysEvicted := int64(metrics.KeysEvicted())

	currentSize := costAdded - costEvicted
	if currentSize < 0 {
		currentSize = 0
	}

	currentItems := keysAdded - keysEvicted
	if currentItems < 0 {
		currentItems = 0
	}

	return Stats{
		Hits:      metrics.Hits(),
		Misses:    metrics.Misses(),
		KeysAdded: uint64(keysAdded),
		Evictions: metrics.KeysEvicted(),
		Size:      currentSize,
		Items:     currentItems,
	}
}

// Close closes the cache and releases resources.
func (c *LRUCache) Close() {
	c.cache.Close()
}
