package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/metrics"
)

// CommunityDataReader defines DB operations for communities API.
type CommunityDataReader interface {
	GetAllCommunities(ctx context.Context) ([]db.GraphCommunity, error)
	GetCommunity(ctx context.Context, id int32) (db.GraphCommunity, error)
	GetCommunityMembers(ctx context.Context, communityID int32) ([]string, error)
	GetCommunitySupernodesWithPositions(ctx context.Context) ([]db.GetCommunitySupernodesWithPositionsRow, error)
	GetCommunityLinks(ctx context.Context, limit int32) ([]db.GetCommunityLinksRow, error)
	GetCommunitySubgraph(ctx context.Context, arg db.GetCommunitySubgraphParams) ([]db.GetCommunitySubgraphRow, error)
}

// communityCacheEntry holds a cached community response and its expiry.
type communityCacheEntry struct {
	data      []byte
	expiresAt time.Time
}

var (
	communityCache    = make(map[string]communityCacheEntry)
	communityCacheMu  sync.Mutex
	communityCacheTTL = 60 * time.Second
)

func communityCacheKey(maxNodes, maxLinks int, withPositions bool) string {
	key := "communities:" + strconv.Itoa(maxNodes) + ":" + strconv.Itoa(maxLinks)
	if withPositions {
		key += ":pos"
	}
	return key
}

type CommunityHandler struct{ queries CommunityDataReader }

// NewCommunityHandler creates a new community handler.
func NewCommunityHandler(q CommunityDataReader) *CommunityHandler {
	return &CommunityHandler{queries: q}
}

// GetCommunities returns supernodes (communities) and inter-community weighted links.
// GET /api/communities?max_nodes=100&max_links=500&with_positions=true
func (h *CommunityHandler) GetCommunities(w http.ResponseWriter, r *http.Request) {
	cfg := config.Load()
	timeout := cfg.GraphQueryTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	// Parse query parameters
	maxNodes := parseIntDefault(r.URL.Query().Get("max_nodes"), 100)
	maxLinks := parseIntDefault(r.URL.Query().Get("max_links"), 500)
	// Note: int32 conversion is safe here as maxLinks is bounded by default/user params
	// and matches pattern used in graph.go (lines 384, 387)
	withPos := func() bool {
		v := strings.TrimSpace(r.URL.Query().Get("with_positions"))
		return v == "1" || strings.EqualFold(v, "true")
	}()

	// Check cache first
	key := communityCacheKey(maxNodes, maxLinks, withPos)
	now := time.Now()
	communityCacheMu.Lock()
	entry, found := communityCache[key]
	if found && entry.expiresAt.After(now) {
		communityCacheMu.Unlock()
		metrics.APICacheHits.WithLabelValues("communities").Inc()
		w.Header().Set("Content-Type", "application/json")
		w.Write(entry.data)
		return
	}
	communityCacheMu.Unlock()
	metrics.APICacheMisses.WithLabelValues("communities").Inc()

	// Fetch community supernodes
	supernodesRows, err := h.queries.GetCommunitySupernodesWithPositions(ctx)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded || err == context.DeadlineExceeded {
			log.Printf("⚠️ communities query timed out after %v", timeout)
			http.Error(w, `{"error":"Communities query timeout"}`, http.StatusRequestTimeout)
			return
		}
		log.Printf("⚠️ failed to fetch community supernodes: %v", err)
		http.Error(w, `{"error":"Failed to fetch communities"}`, http.StatusInternalServerError)
		return
	}

	// Fetch inter-community links
	linksRows, err := h.queries.GetCommunityLinks(ctx, int32(maxLinks))
	if err != nil {
		log.Printf("⚠️ failed to fetch community links: %v", err)
		http.Error(w, `{"error":"Failed to fetch community links"}`, http.StatusInternalServerError)
		return
	}

	// Build response in same format as /api/graph
	nodes := make([]GraphNode, 0, len(supernodesRows))
	for _, row := range supernodesRows {
		if len(nodes) >= maxNodes {
			break
		}
		v := atoiSafe(row.Val)
		gn := GraphNode{
			ID:   row.ID,
			Name: row.Name,
			Val:  v,
			Type: "community",
		}
		if withPos && row.PosX != 0 && row.PosY != 0 {
			x := row.PosX
			y := row.PosY
			z := row.PosZ
			gn.X = &x
			gn.Y = &y
			gn.Z = &z
		}
		nodes = append(nodes, gn)
	}

	links := make([]GraphLink, 0, len(linksRows))
	for _, row := range linksRows {
		src := toString(row.Source)
		tgt := toString(row.Target)
		if src != "" && tgt != "" {
			links = append(links, GraphLink{Source: src, Target: tgt})
		}
	}

	resp := GraphResponse{Nodes: nodes, Links: links}
	b, _ := json.Marshal(resp)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)

	// Store in cache
	communityCacheMu.Lock()
	communityCache[key] = communityCacheEntry{data: b, expiresAt: time.Now().Add(communityCacheTTL)}
	communityCacheMu.Unlock()
}

// GetCommunityByID returns the subgraph of a specific community.
// GET /api/communities/{id}?max_nodes=10000&max_links=50000&with_positions=true
func (h *CommunityHandler) GetCommunityByID(w http.ResponseWriter, r *http.Request) {
	cfg := config.Load()
	timeout := cfg.GraphQueryTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	// Parse community ID from URL
	vars := mux.Vars(r)
	idStr := vars["id"]
	communityID64, err := strconv.ParseInt(idStr, 10, 32)
	if err != nil || communityID64 < 0 || communityID64 > math.MaxInt32 {
		http.Error(w, `{"error":"Invalid community ID"}`, http.StatusBadRequest)
		return
	}
	communityID := int32(communityID64)

	// Parse query parameters
	maxNodes := parseIntDefault(r.URL.Query().Get("max_nodes"), 10000)
	maxLinks := parseIntDefault(r.URL.Query().Get("max_links"), 50000)
	withPos := func() bool {
		v := strings.TrimSpace(r.URL.Query().Get("with_positions"))
		return v == "1" || strings.EqualFold(v, "true")
	}()

	// Check cache
	key := "community:" + idStr + ":" + strconv.Itoa(maxNodes) + ":" + strconv.Itoa(maxLinks)
	if withPos {
		key += ":pos"
	}
	now := time.Now()
	communityCacheMu.Lock()
	entry, found := communityCache[key]
	if found && entry.expiresAt.After(now) {
		communityCacheMu.Unlock()
		metrics.APICacheHits.WithLabelValues("community_subgraph").Inc()
		w.Header().Set("Content-Type", "application/json")
		w.Write(entry.data)
		return
	}
	communityCacheMu.Unlock()
	metrics.APICacheMisses.WithLabelValues("community_subgraph").Inc()

	// Verify community exists
	_, err = h.queries.GetCommunity(ctx, communityID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"Community not found"}`, http.StatusNotFound)
			return
		}
		log.Printf("⚠️ failed to fetch community %d: %v", communityID, err)
		http.Error(w, `{"error":"Failed to fetch community"}`, http.StatusInternalServerError)
		return
	}

	// Fetch subgraph
	totalLimit := int32(maxNodes + maxLinks)
	rows, err := h.queries.GetCommunitySubgraph(ctx, db.GetCommunitySubgraphParams{
		CommunityID: communityID,
		Limit:       totalLimit,
	})
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded || err == context.DeadlineExceeded {
			log.Printf("⚠️ community subgraph query timed out after %v", timeout)
			http.Error(w, `{"error":"Query timeout"}`, http.StatusRequestTimeout)
			return
		}
		log.Printf("⚠️ failed to fetch community subgraph: %v", err)
		http.Error(w, `{"error":"Failed to fetch community subgraph"}`, http.StatusInternalServerError)
		return
	}

	// Build response
	nodes := make(map[string]GraphNode)
	links := make([]GraphLink, 0)

	for _, row := range rows {
		switch strings.ToLower(row.DataType) {
		case "node":
			if len(nodes) >= maxNodes {
				continue
			}
			v := atoiSafe(row.Val)
			t := ""
			if row.Type.Valid {
				t = strings.ToLower(row.Type.String)
			}
			gn := GraphNode{ID: row.ID, Name: row.Name, Val: v, Type: t}
			if withPos {
				if row.PosX.Valid {
					x := row.PosX.Float64
					gn.X = &x
				}
				if row.PosY.Valid {
					y := row.PosY.Float64
					gn.Y = &y
				}
				if row.PosZ.Valid {
					z := row.PosZ.Float64
					gn.Z = &z
				}
			}
			nodes[row.ID] = gn
		case "link":
			if len(links) >= maxLinks {
				continue
			}
			src := toString(row.Source)
			tgt := toString(row.Target)
			if src != "" && tgt != "" {
				links = append(links, GraphLink{Source: src, Target: tgt})
			}
		}
	}

	// Convert nodes map to slice
	nodeSlice := make([]GraphNode, 0, len(nodes))
	for _, n := range nodes {
		nodeSlice = append(nodeSlice, n)
	}

	resp := GraphResponse{Nodes: nodeSlice, Links: links}
	b, _ := json.Marshal(resp)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)

	// Store in cache
	communityCacheMu.Lock()
	communityCache[key] = communityCacheEntry{data: b, expiresAt: time.Now().Add(communityCacheTTL)}
	communityCacheMu.Unlock()
}
