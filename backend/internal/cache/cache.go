package cache

import "time"

// Cache defines the interface for caching serialized data with TTL.
type Cache interface {
	// Get retrieves a value from the cache by key.
	// Returns the value and true if found and not expired, otherwise nil and false.
	Get(key string) ([]byte, bool)

	// Set stores a value in the cache with the given key and TTL.
	// TTL of 0 means use the default cache TTL.
	Set(key string, value []byte, ttl time.Duration)

	// Delete removes a value from the cache.
	Delete(key string)

	// Clear removes all values from the cache.
	Clear()

	// Stats returns cache statistics.
	Stats() Stats
}

// Stats represents cache statistics.
type Stats struct {
	Hits      uint64 // Total cache hits
	Misses    uint64 // Total cache misses
	KeysAdded uint64 // Total keys added
	Evictions uint64 // Total evictions
	Size      int64  // Approximate size in bytes
	Items     int64  // Current number of items
}
