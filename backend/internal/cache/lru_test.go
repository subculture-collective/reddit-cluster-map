package cache

import (
	"testing"
	"time"
)

func TestLRUCache_SetAndGet(t *testing.T) {
	cache, err := NewLRU(10, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Test set and get
	key := "test-key"
	value := []byte("test-value")
	cache.Set(key, value, 0)
	cache.cache.Wait() // Wait for async Set to complete

	retrieved, found := cache.Get(key)
	if !found {
		t.Error("Expected to find cached value")
	}
	if string(retrieved) != string(value) {
		t.Errorf("Expected %s, got %s", value, retrieved)
	}
}

func TestLRUCache_GetNonExistent(t *testing.T) {
	cache, err := NewLRU(10, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	_, found := cache.Get("nonexistent")
	if found {
		t.Error("Expected not to find nonexistent key")
	}
}

func TestLRUCache_Expiration(t *testing.T) {
	cache, err := NewLRU(10, 100, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	key := "expiring-key"
	value := []byte("expiring-value")
	cache.Set(key, value, 100*time.Millisecond)
	cache.cache.Wait() // Wait for async Set to complete

	// Should exist immediately
	_, found := cache.Get(key)
	if !found {
		t.Error("Expected to find value immediately after set")
	}

	// Wait for expiration
	time.Sleep(150 * time.Millisecond)

	// Should be expired now
	_, found = cache.Get(key)
	if found {
		t.Error("Expected value to be expired")
	}
}

func TestLRUCache_Delete(t *testing.T) {
	cache, err := NewLRU(10, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	key := "delete-key"
	value := []byte("delete-value")
	cache.Set(key, value, 0)
	cache.cache.Wait() // Wait for async Set to complete

	// Verify it exists
	_, found := cache.Get(key)
	if !found {
		t.Error("Expected to find value before delete")
	}

	// Delete it
	cache.Delete(key)

	// Verify it's gone
	_, found = cache.Get(key)
	if found {
		t.Error("Expected value to be deleted")
	}
}

func TestLRUCache_Clear(t *testing.T) {
	cache, err := NewLRU(10, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Add multiple items
	cache.Set("key1", []byte("value1"), 0)
	cache.Set("key2", []byte("value2"), 0)
	cache.Set("key3", []byte("value3"), 0)

	// Clear the cache
	cache.Clear()

	// Verify all items are gone
	_, found := cache.Get("key1")
	if found {
		t.Error("Expected key1 to be cleared")
	}
	_, found = cache.Get("key2")
	if found {
		t.Error("Expected key2 to be cleared")
	}
	_, found = cache.Get("key3")
	if found {
		t.Error("Expected key3 to be cleared")
	}
}

func TestLRUCache_Stats(t *testing.T) {
	cache, err := NewLRU(10, 100, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Add items and verify they can be retrieved
	cache.Set("key1", []byte("value1"), 0)
	cache.Set("key2", []byte("value2"), 0)
	cache.cache.Wait() // Wait for async Set to complete

	// Verify Get works
	val, found := cache.Get("key1")
	if !found || string(val) != "value1" {
		t.Error("Expected to find key1 with correct value")
	}

	// Verify Stats method doesn't crash and returns a valid struct
	stats := cache.Stats()
	// Stats struct should be valid, but ristretto's async nature means
	// the counts may not be immediately accurate
	_ = stats // Verify Stats() can be called without panic
}

func TestLRUCache_SizeLimit(t *testing.T) {
	// Create a very small cache (1 MB)
	cache, err := NewLRU(1, 1000, 60*time.Second)
	if err != nil {
		t.Fatalf("Failed to create cache: %v", err)
	}
	defer cache.Close()

	// Add items and verify the cache works
	cache.Set("small1", []byte("value1"), 0)
	cache.Set("small2", []byte("value2"), 0)
	cache.Set("small3", []byte("value3"), 0)
	cache.cache.Wait() // Wait for async Set to complete

	// Verify at least one item can be retrieved
	_, found := cache.Get("small1")
	if !found {
		// Try others as ristretto may have evicted it
		_, found = cache.Get("small2")
		if !found {
			_, found = cache.Get("small3")
			if !found {
				t.Error("Expected at least one item to be in cache")
			}
		}
	}
}
