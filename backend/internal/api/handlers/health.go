package handlers

import (
	"encoding/json"
	"net/http"
)

// Health returns a simple JSON payload to indicate the API is alive.
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
