package cache

import "time"

// MockCache is a simple in-memory cache for testing that implements the Cache interface.
type MockCache struct {
	data map[string][]byte
}

// NewMockCache creates a new mock cache for testing.
func NewMockCache() *MockCache {
	return &MockCache{
		data: make(map[string][]byte),
	}
}

func (m *MockCache) Get(key string) ([]byte, bool) {
	val, found := m.data[key]
	return val, found
}

func (m *MockCache) Set(key string, value []byte, ttl time.Duration) {
	m.data[key] = value
}

func (m *MockCache) Delete(key string) {
	delete(m.data, key)
}

func (m *MockCache) Clear() {
	m.data = make(map[string][]byte)
}

func (m *MockCache) Stats() Stats {
	return Stats{
		Items: int64(len(m.data)),
	}
}
