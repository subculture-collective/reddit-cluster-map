package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/onnwee/reddit-cluster-map/backend/internal/apierr"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/logger"
	"github.com/onnwee/reddit-cluster-map/backend/internal/metrics"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second
	
	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second
	
	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = 30 * time.Second
	
	// Maximum message size allowed from peer
	maxMessageSize = 512
	
	// How often to check for new graph versions
	versionCheckInterval = 5 * time.Second
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for now - CORS middleware handles this
		return true
	},
}

// WebSocketMessage represents a message sent to clients
type WebSocketMessage struct {
	Type    string      `json:"type"`    // "diff", "version", "error", "ping"
	Payload interface{} `json:"payload"`
}

// GraphDiffMessage represents an incremental graph update
type GraphDiffMessage struct {
	Action     string      `json:"action"` // "add", "remove", "update"
	Nodes      []GraphNode `json:"nodes,omitempty"`
	Links      []GraphLink `json:"links,omitempty"`
	VersionID  int64       `json:"version_id"`
}

// Client represents a WebSocket client connection
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	lastVersion int64
	mu       sync.RWMutex
}

// Hub maintains the set of active clients and broadcasts messages to them
type Hub struct {
	// Registered clients
	clients map[*Client]bool
	
	// Register requests from clients
	register chan *Client
	
	// Unregister requests from clients
	unregister chan *Client
	
	// Broadcast messages to all clients
	broadcast chan []byte
	
	// Database queries
	queries VersionReader
	
	// Last known version ID
	lastVersionID int64
	
	// Stop channel for version monitoring
	stop chan struct{}
	
	mu sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub(q VersionReader) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		queries:    q,
		stop:       make(chan struct{}),
	}
}

// Run starts the hub's main loop and version monitoring
func (h *Hub) Run(ctx context.Context) {
	// Start version monitoring in a separate goroutine
	go h.monitorVersionChanges(ctx)
	
	for {
		select {
		case <-ctx.Done():
			return
			
		case <-h.stop:
			return
			
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			metrics.WebSocketConnections.Inc()
			logger.Info("WebSocket client connected", "total_clients", len(h.clients))
			
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				metrics.WebSocketConnections.Dec()
				logger.Info("WebSocket client disconnected", "total_clients", len(h.clients))
			}
			h.mu.Unlock()
			
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send buffer is full, close the connection
					close(client.send)
					delete(h.clients, client)
					metrics.WebSocketConnections.Dec()
				}
			}
			h.mu.RUnlock()
		}
	}
}

// monitorVersionChanges periodically checks for new graph versions and broadcasts diffs
func (h *Hub) monitorVersionChanges(ctx context.Context) {
	ticker := time.NewTicker(versionCheckInterval)
	defer ticker.Stop()
	
	// Initialize with current version
	currentVersion, err := h.queries.GetCurrentGraphVersion(ctx)
	if err != nil && err != sql.ErrNoRows {
		logger.Warn("Failed to get initial graph version for WebSocket monitoring", "error", err)
	} else if err == nil {
		h.lastVersionID = currentVersion.ID
		logger.Info("WebSocket version monitoring started", "initial_version", h.lastVersionID)
	}
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-h.stop:
			return
		case <-ticker.C:
			// Check if there are any connected clients
			h.mu.RLock()
			clientCount := len(h.clients)
			h.mu.RUnlock()
			
			if clientCount == 0 {
				// No clients, skip version check
				continue
			}
			
			// Check for version change
			newVersion, err := h.queries.GetCurrentGraphVersion(ctx)
			if err != nil {
				if err != sql.ErrNoRows {
					logger.Warn("Failed to check graph version", "error", err)
				}
				continue
			}
			
			// If version changed, broadcast diff to all clients
			if newVersion.ID > h.lastVersionID {
				logger.Info("New graph version detected", "old_version", h.lastVersionID, "new_version", newVersion.ID)
				if err := h.BroadcastDiff(ctx, newVersion.ID); err != nil {
					logger.Error("Failed to broadcast graph diff", "error", err, "version_id", newVersion.ID)
				}
				h.lastVersionID = newVersion.ID
			}
		}
	}
}

// BroadcastDiff sends graph diff to all connected clients
func (h *Hub) BroadcastDiff(ctx context.Context, versionID int64) error {
	// Get all clients' last known versions
	h.mu.RLock()
	clientVersions := make(map[*Client]int64, len(h.clients))
	for client := range h.clients {
		client.mu.RLock()
		clientVersions[client] = client.lastVersion
		client.mu.RUnlock()
	}
	h.mu.RUnlock()
	
	if len(clientVersions) == 0 {
		// No clients connected
		return nil
	}
	
	// For each unique version, fetch diff and send to relevant clients
	versionMap := make(map[int64][]*Client)
	for client, version := range clientVersions {
		versionMap[version] = append(versionMap[version], client)
	}
	
	for sinceVersion, clients := range versionMap {
		// Fetch diff since this version
		diffs, err := h.queries.GetGraphDiffsSinceVersion(ctx, sinceVersion)
		if err != nil {
			logger.Error("Failed to fetch graph diffs for WebSocket broadcast", "error", err, "since_version", sinceVersion)
			continue
		}
		
		if len(diffs) == 0 {
			continue
		}
		
		// Group diffs by action
		addedNodes := make([]GraphNode, 0)
		removedNodes := make([]GraphNode, 0)
		updatedNodes := make([]GraphNode, 0)
		addedLinks := make([]GraphLink, 0)
		removedLinks := make([]GraphLink, 0)
		
		for _, diff := range diffs {
			if diff.EntityType == "node" {
				node := GraphNode{
					ID:   diff.EntityID,
					Name: diff.EntityID, // Will be filled from NewVal if available
				}
				
				if diff.NewVal.Valid {
					// Parse val
					val := atoiSafe(diff.NewVal.String)
					node.Val = val
				}
				
				if diff.NewPosX.Valid && diff.NewPosY.Valid && diff.NewPosZ.Valid {
					x, y, z := diff.NewPosX.Float64, diff.NewPosY.Float64, diff.NewPosZ.Float64
					node.X = &x
					node.Y = &y
					node.Z = &z
				}
				
				switch diff.Action {
				case "add":
					addedNodes = append(addedNodes, node)
				case "remove":
					removedNodes = append(removedNodes, node)
				case "update":
					updatedNodes = append(updatedNodes, node)
				}
			} else if diff.EntityType == "link" {
				// Parse entity_id as "source->target"
				// This is a simplification; adjust based on actual schema
				link := GraphLink{
					Source: diff.EntityID, // Adjust parsing as needed
					Target: diff.EntityID,
				}
				
				switch diff.Action {
				case "add":
					addedLinks = append(addedLinks, link)
				case "remove":
					removedLinks = append(removedLinks, link)
				}
			}
		}
		
		// Send separate messages for each action type to make client-side processing easier
		messages := []GraphDiffMessage{}
		
		if len(addedNodes) > 0 || len(addedLinks) > 0 {
			messages = append(messages, GraphDiffMessage{
				Action:    "add",
				Nodes:     addedNodes,
				Links:     addedLinks,
				VersionID: versionID,
			})
		}
		
		if len(removedNodes) > 0 || len(removedLinks) > 0 {
			messages = append(messages, GraphDiffMessage{
				Action:    "remove",
				Nodes:     removedNodes,
				Links:     removedLinks,
				VersionID: versionID,
			})
		}
		
		if len(updatedNodes) > 0 {
			messages = append(messages, GraphDiffMessage{
				Action:    "update",
				Nodes:     updatedNodes,
				Links:     []GraphLink{},
				VersionID: versionID,
			})
		}
		
		// Send messages to clients
		for _, msg := range messages {
			wsMsg := WebSocketMessage{
				Type:    "diff",
				Payload: msg,
			}
			
			data, err := json.Marshal(wsMsg)
			if err != nil {
				logger.Error("Failed to marshal WebSocket diff message", "error", err)
				continue
			}
			
			// Send to clients that need this version update
			for _, client := range clients {
				select {
				case client.send <- data:
					// Update client's last known version
					client.mu.Lock()
					client.lastVersion = versionID
					client.mu.Unlock()
				default:
					// Client buffer full
					logger.Warn("Client send buffer full, skipping update")
				}
			}
		}
	}
	
	metrics.WebSocketMessagesSent.Add(float64(len(clientVersions)))
	return nil
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Warn("WebSocket unexpected close", "error", err)
			}
			break
		}
		
		// Handle client messages (e.g., version updates, subscriptions)
		var clientMsg map[string]interface{}
		if err := json.Unmarshal(message, &clientMsg); err == nil {
			if msgType, ok := clientMsg["type"].(string); ok {
				if msgType == "version" {
					if versionID, ok := clientMsg["version_id"].(float64); ok {
						c.mu.Lock()
						c.lastVersion = int64(versionID)
						c.mu.Unlock()
					}
				}
			}
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			
			// Add queued messages to the current WebSocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}
			
			if err := w.Close(); err != nil {
				return
			}
			
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// WebSocketHandler handles WebSocket connections for graph updates
type WebSocketHandler struct {
	hub     *Hub
	queries VersionReader
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(q VersionReader) *WebSocketHandler {
	hub := NewHub(q)
	// Start the hub in the background with a long-lived context
	go hub.Run(context.Background())
	
	return &WebSocketHandler{
		hub:     hub,
		queries: q,
	}
}

// HandleWebSocket handles WebSocket upgrade and client connection
// GET /api/graph/ws
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade to WebSocket", "error", err)
		apierr.WriteErrorWithContext(w, r, apierr.SystemInternal("Failed to establish WebSocket connection"))
		return
	}
	
	// Get current graph version
	currentVersion, err := h.queries.GetCurrentGraphVersion(r.Context())
	if err != nil {
		logger.Error("Failed to get current graph version for WebSocket client", "error", err)
		// Still allow connection but with version 0
		currentVersion = db.GraphVersion{ID: 0}
	}
	
	client := &Client{
		hub:         h.hub,
		conn:        conn,
		send:        make(chan []byte, 256),
		lastVersion: currentVersion.ID,
	}
	
	h.hub.register <- client
	
	// Send initial version info
	versionMsg := WebSocketMessage{
		Type: "version",
		Payload: map[string]interface{}{
			"version_id":  currentVersion.ID,
			"node_count":  currentVersion.NodeCount,
			"link_count":  currentVersion.LinkCount,
		},
	}
	
	if data, err := json.Marshal(versionMsg); err == nil {
		select {
		case client.send <- data:
		default:
		}
	}
	
	// Start goroutines for this client
	go client.writePump()
	go client.readPump()
}

// GetHub returns the WebSocket hub for external broadcasting
func (h *WebSocketHandler) GetHub() *Hub {
	return h.hub
}
