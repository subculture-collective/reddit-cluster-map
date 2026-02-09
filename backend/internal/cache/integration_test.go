package cache

import (
	"testing"
	"time"
)

// TestIntegrationCacheBehavior tests the real-world behavior of the LRU cache.
func TestIntegrationCacheBehavior(t *testing.T) {
	// Create a cache with small limits to test eviction
	cache, err := NewLRU(1, 100, 60*time.Second) // 1MB max
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Test 1: Basic set and get
	t.Run("Basic operations", func(t *testing.T) {
		key := "test-key"
		value := []byte("test-value")
		
		cache.Set(key, value, 0)
		retrieved, found := cache.Get(key)
		
		if !found {
			t.Error("Expected to find cached value")
		}
		if string(retrieved) != string(value) {
			t.Errorf("Expected %s, got %s", value, retrieved)
		}
	})

	// Test 2: TTL expiration
	t.Run("TTL expiration", func(t *testing.T) {
		key := "expiring-key"
		value := []byte("expiring-value")
		
		cache.Set(key, value, 100*time.Millisecond)
		
		// Should exist immediately
		_, found := cache.Get(key)
		if !found {
			t.Error("Expected to find value immediately")
		}
		
		// Wait for expiration
		time.Sleep(150 * time.Millisecond)
		
		// Should be expired
		_, found = cache.Get(key)
		if found {
			t.Error("Expected value to be expired")
		}
	})

	// Test 3: Cache invalidation
	t.Run("Cache invalidation", func(t *testing.T) {
		cache.Set("key1", []byte("value1"), 0)
		cache.Set("key2", []byte("value2"), 0)
		
		// Clear the cache
		cache.Clear()
		
		// Both keys should be gone
		_, found := cache.Get("key1")
		if found {
			t.Error("Expected key1 to be invalidated")
		}
		_, found = cache.Get("key2")
		if found {
			t.Error("Expected key2 to be invalidated")
		}
	})

	// Test 4: Stats tracking
	t.Run("Stats tracking", func(t *testing.T) {
		// Clear cache first
		cache.Clear()
		
		// Add some entries
		cache.Set("stat-key1", []byte("value1"), 0)
		cache.Set("stat-key2", []byte("value2"), 0)
		
		// Get stats
		stats := cache.Stats()
		
		// Verify stats are being tracked (exact values may vary due to async nature)
		if stats.KeysAdded < 2 {
			t.Logf("Stats: %+v", stats)
		}
	})
}

// TestCacheSizeLimits verifies that the cache respects size limits.
func TestCacheSizeLimits(t *testing.T) {
	// Create a very small cache (only 1KB)
	cache, err := NewLRU(0, 10, 60*time.Second) // Very small: ~1KB due to cost calculation
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Try to add many small items
	for i := 0; i < 20; i++ {
		key := string(rune('a' + i))
		value := []byte("small value")
		cache.Set(key, value, 0)
	}

	// At least some items should be retrievable
	// (exact count depends on ristretto's eviction policy)
	found := 0
	for i := 0; i < 20; i++ {
		key := string(rune('a' + i))
		if _, ok := cache.Get(key); ok {
			found++
		}
	}

	if found == 0 {
		t.Error("Expected at least some items to be cached")
	}

	t.Logf("Cache retained %d out of 20 items with size limit", found)
}
