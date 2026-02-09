package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/apierr"
	"github.com/onnwee/reddit-cluster-map/backend/internal/cache"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/logger"
	"github.com/onnwee/reddit-cluster-map/backend/internal/metrics"
	"github.com/onnwee/reddit-cluster-map/backend/internal/tracing"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

// Handler handles HTTP requests for the graph API.
type GraphDataReader interface {
	// Legacy aggregated JSON (users+subreddits only)
	GetGraphData(ctx context.Context) ([]json.RawMessage, error)
	// Precalculated graph tables (graph_nodes/graph_links)
	GetPrecalculatedGraphDataCappedAll(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedAllParams) ([]db.GetPrecalculatedGraphDataCappedAllRow, error)
	GetPrecalculatedGraphDataCappedFiltered(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedFilteredParams) ([]db.GetPrecalculatedGraphDataCappedFilteredRow, error)
	GetPrecalculatedGraphDataNoPos(ctx context.Context) ([]db.GetPrecalculatedGraphDataNoPosRow, error)
	// Edge bundles
	GetEdgeBundles(ctx context.Context, weight int32) ([]db.GetEdgeBundlesRow, error)
}

func cacheKey(maxNodes, maxLinks int, typeKey string, withPositions bool) string {
	if typeKey == "" {
		typeKey = "all"
	}
	key := strconv.Itoa(maxNodes) + ":" + strconv.Itoa(maxLinks) + ":" + typeKey
	if withPositions {
		key += ":pos"
	}
	return key
}

type Handler struct {
	queries GraphDataReader
	cache   cache.Cache
}

// NewHandler creates a new graph handler.
func NewHandler(q GraphDataReader, c cache.Cache) *Handler {
	return &Handler{
		queries: q,
		cache:   c,
	}
}

type GraphNode struct {
	ID   string   `json:"id"`
	Name string   `json:"name"`
	Val  int      `json:"val"`
	Type string   `json:"type,omitempty"`
	X    *float64 `json:"x,omitempty"`
	Y    *float64 `json:"y,omitempty"`
	Z    *float64 `json:"z,omitempty"`
}

type GraphLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Links []GraphLink `json:"links"`
}

// GetGraphData returns the graph data.
// It prefers the precalculated graph tables (graph_nodes/graph_links) when available,
// and falls back to the legacy aggregated JSON if none are present.
func (h *Handler) GetGraphData(w http.ResponseWriter, r *http.Request) {
	ctx, span := tracing.StartSpan(r.Context(), "handlers.GetGraphData")
	defer span.End()

	// Derive a bounded context to avoid very long queries
	cfg := config.Load()
	timeout := cfg.GraphQueryTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Optional caps and fallback control via query params
	maxNodes := parseIntDefault(r.URL.Query().Get("max_nodes"), 20000)
	maxLinks := parseIntDefault(r.URL.Query().Get("max_links"), 50000)
	fallback := r.URL.Query().Get("fallback")
	allowFallback := fallback == "" || fallback == "1" || strings.EqualFold(fallback, "true")
	allowedTypes, allowedList, typeKey, allowAll := parseTypes(r.URL.Query().Get("types"))
	withPos := func() bool {
		v := strings.TrimSpace(r.URL.Query().Get("with_positions"))
		return v == "1" || strings.EqualFold(v, "true")
	}()

	// Add attributes to span
	span.SetAttributes(
		attribute.Int("max_nodes", maxNodes),
		attribute.Int("max_links", maxLinks),
		attribute.Bool("with_positions", withPos),
		attribute.String("type_filter", typeKey),
	)

	if !allowAll && len(allowedTypes) == 0 {
		span.SetAttributes(attribute.String("result", "empty_filter"))
		writeCachedEmpty(w, h, maxNodes, maxLinks, typeKey, withPos)
		return
	}

	// Check cache first
	key := cacheKey(maxNodes, maxLinks, typeKey, withPos)
	if cachedData, found := h.cache.Get(key); found {
		metrics.APICacheHits.WithLabelValues("graph").Inc()
		span.SetAttributes(attribute.Bool("cache_hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cachedData)
		return
	}
	metrics.APICacheMisses.WithLabelValues("graph").Inc()
	span.SetAttributes(attribute.Bool("cache_hit", false))

	// Try precalculated tables (capped) first
	rows, err := fetchPrecalcCapped(ctx, h.queries, maxNodes, maxLinks, allowAll, allowedList)
	if err != nil {
		// Check if this was a timeout/cancellation
		if ctx.Err() == context.DeadlineExceeded || err == context.DeadlineExceeded {
			logger.WarnContext(ctx, "Precalc query timed out", "timeout", timeout)
			span.RecordError(err)
			span.SetStatus(codes.Error, "query timeout")
			apierr.WriteErrorWithContext(w, r, apierr.GraphTimeout(""))
			return
		}
		if ctx.Err() == context.Canceled || err == context.Canceled {
			logger.WarnContext(ctx, "Precalc query was canceled")
			span.RecordError(err)
			span.SetStatus(codes.Error, "query canceled")
			apierr.WriteErrorWithContext(w, r, apierr.SystemTimeout("Request canceled"))
			return
		}
		logger.WarnContext(ctx, "Precalc capped query failed, falling back", "error", err)
		span.AddEvent("precalc_query_failed")
		// Continue to fallback
	}
	if len(rows) > 0 {
		// Build nodes/links then apply caps
		nodes := make(map[string]GraphNode, len(rows))
		links := make([]GraphLink, 0, len(rows))
		for _, row := range rows {
			switch strings.ToLower(row.DataType) {
			case "node":
				v := atoiSafe(row.Val)
				t := ""
				if (row.Type != sql.NullString{}) && row.Type.Valid {
					t = strings.ToLower(row.Type.String)
				}
				if !allowAll {
					if len(allowedTypes) == 0 {
						continue
					}
					if t != "" {
						if _, ok := allowedTypes[t]; !ok {
							continue
						}
					} else {
						continue
					}
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
				src := toString(row.Source)
				tgt := toString(row.Target)
				if src != "" && tgt != "" {
					links = append(links, GraphLink{Source: src, Target: tgt})
				}
			}
		}
		resp := capGraph(nodes, links, maxNodes, maxLinks)
		// Marshal once so we can both write and cache it
		b, _ := json.Marshal(resp)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
		// store in cache
		h.cache.Set(key, b, 0) // 0 means use default TTL
		return
	}

	// Fallback to legacy aggregated JSON (users+subreddits only)
	if !allowFallback {
		w.Header().Set("Content-Type", "application/json")
		empty := GraphResponse{Nodes: []GraphNode{}, Links: []GraphLink{}}
		b, _ := json.Marshal(empty)
		_, _ = w.Write(b)
		// cache empty response too
		h.cache.Set(key, b, 0)
		return
	}
	handleLegacyGraph(ctx, w, r, h, maxNodes, maxLinks, allowAll, allowedTypes, typeKey, withPos)
}

func toString(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	default:
		// generated type may use []uint8 for TEXT
		if b, ok := x.([]byte); ok {
			return string(b)
		}
		return ""
	}
}

// atoiSafe parses an int from text, returning 0 on error.
func atoiSafe(s string) int {
	if s == "" {
		return 0
	}
	if iv, err := strconv.Atoi(s); err == nil {
		return iv
	}
	return 0
}

// capGraph selects up to maxNodes by weight and filters links accordingly.
// Weight prefers higher Val and degree.
func capGraph(nodes map[string]GraphNode, links []GraphLink, maxNodes, maxLinks int) GraphResponse {
	if maxNodes <= 0 {
		maxNodes = 20000
	}
	if maxLinks <= 0 {
		maxLinks = 50000
	}
	// degree count
	deg := make(map[string]int, len(nodes))
	for _, l := range links {
		deg[l.Source]++
		deg[l.Target]++
	}
	// slice and sort by weight
	list := make([]GraphNode, 0, len(nodes))
	for _, n := range nodes {
		list = append(list, n)
	}
	// weight = max(Val, degree)
	sort.Slice(list, func(i, j int) bool {
		wi := list[i].Val
		if di := deg[list[i].ID]; di > wi {
			wi = di
		}
		wj := list[j].Val
		if dj := deg[list[j].ID]; dj > wj {
			wj = dj
		}
		if wi == wj {
			return list[i].ID < list[j].ID
		}
		return wi > wj
	})
	if len(list) > maxNodes {
		list = list[:maxNodes]
	}
	keep := make(map[string]struct{}, len(list))
	for _, n := range list {
		keep[n.ID] = struct{}{}
	}
	keptLinks := make([]GraphLink, 0, min(maxLinks, len(links)))
	for _, l := range links {
		if _, ok := keep[l.Source]; !ok {
			continue
		}
		if _, ok := keep[l.Target]; !ok {
			continue
		}
		keptLinks = append(keptLinks, l)
		if len(keptLinks) >= maxLinks {
			break
		}
	}
	return GraphResponse{Nodes: list, Links: keptLinks}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return def
}

func handleLegacyGraph(ctx context.Context, w http.ResponseWriter, r *http.Request, h *Handler, maxNodes, maxLinks int, allowAll bool, allowedTypes map[string]struct{}, typeKey string, withPos bool) {
	cacheKeyStr := cacheKey(maxNodes, maxLinks, typeKey, withPos)
	data, err := h.queries.GetGraphData(ctx)
	if err != nil {
		apierr.WriteErrorWithContext(w, r, apierr.GraphQueryFailed("Failed to fetch graph data"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if len(data) == 1 {
		var resp GraphResponse
		if err := json.Unmarshal(data[0], &resp); err == nil {
			nodes := make(map[string]GraphNode, len(resp.Nodes))
			for _, n := range resp.Nodes {
				t := strings.ToLower(n.Type)
				if !allowAll {
					if len(allowedTypes) == 0 {
						continue
					}
					if t == "" {
						continue
					}
					if _, ok := allowedTypes[t]; !ok {
						continue
					}
				}
				n.Type = t
				nodes[n.ID] = n
			}
			capped := capGraph(nodes, resp.Links, maxNodes, maxLinks)
			// Marshal once so we can write and cache
			b, _ := json.Marshal(capped)
			_, _ = w.Write(b)
			// store in cache keyed by caps
			h.cache.Set(cacheKeyStr, b, 0)
			return
		}
	}
	// Unknown legacy format; return empty and cache it
	empty := GraphResponse{Nodes: []GraphNode{}, Links: []GraphLink{}}
	b, _ := json.Marshal(empty)
	_, _ = w.Write(b)
	h.cache.Set(cacheKeyStr, b, 0)
}

// preRow is an internal union row type for capped precalc results including optional positions
type preRow struct {
	DataType string
	ID       string
	Name     string
	Val      string
	Type     sql.NullString
	PosX     sql.NullFloat64
	PosY     sql.NullFloat64
	PosZ     sql.NullFloat64
	Source   interface{}
	Target   interface{}
}

// fetchPrecalcCapped runs a DB-level capped selection of precalculated graph data.
func fetchPrecalcCapped(ctx context.Context, q GraphDataReader, maxNodes, maxLinks int, allowAll bool, allowedTypes []string) ([]preRow, error) {
	if maxNodes <= 0 {
		maxNodes = 20000
	}
	if maxLinks <= 0 {
		maxLinks = 50000
	}
	if allowAll {
		allRows, err := q.GetPrecalculatedGraphDataCappedAll(ctx, db.GetPrecalculatedGraphDataCappedAllParams{
			Limit:   int32(maxNodes),
			Limit_2: int32(maxLinks),
		})
		if err != nil {
			return nil, err
		}
		out := make([]preRow, len(allRows))
		for i, r := range allRows {
			out[i] = preRow{DataType: r.DataType, ID: r.ID, Name: r.Name, Val: r.Val, Type: r.Type, PosX: r.PosX, PosY: r.PosY, PosZ: r.PosZ, Source: r.Source, Target: r.Target}
		}
		return out, nil
	}
	arr := make([]string, len(allowedTypes))
	copy(arr, allowedTypes)
	filteredRows, err := q.GetPrecalculatedGraphDataCappedFiltered(ctx, db.GetPrecalculatedGraphDataCappedFilteredParams{
		Column1: arr,
		Limit:   int32(maxNodes),
		Limit_2: int32(maxLinks),
	})
	if err != nil {
		return nil, err
	}
	out := make([]preRow, len(filteredRows))
	for i, r := range filteredRows {
		out[i] = preRow{DataType: r.DataType, ID: r.ID, Name: r.Name, Val: r.Val, Type: r.Type, PosX: r.PosX, PosY: r.PosY, PosZ: r.PosZ, Source: r.Source, Target: r.Target}
	}
	return out, nil
}

func parseTypes(raw string) (map[string]struct{}, []string, string, bool) {
	if raw == "" {
		return nil, nil, "all", true
	}
	parts := strings.Split(raw, ",")
	allowed := make(map[string]struct{})
	for _, p := range parts {
		t := strings.ToLower(strings.TrimSpace(p))
		if t == "" {
			continue
		}
		allowed[t] = struct{}{}
	}
	if len(allowed) == 0 {
		return map[string]struct{}{}, []string{}, "none:" + raw, false
	}
	list := make([]string, 0, len(allowed))
	for t := range allowed {
		list = append(list, t)
	}
	sort.Strings(list)
	return allowed, list, strings.Join(list, ","), false
}

func writeCachedEmpty(w http.ResponseWriter, h *Handler, maxNodes, maxLinks int, typeKey string, withPos bool) {
	w.Header().Set("Content-Type", "application/json")
	empty := GraphResponse{Nodes: []GraphNode{}, Links: []GraphLink{}}
	b, _ := json.Marshal(empty)
	_, _ = w.Write(b)
	h.cache.Set(cacheKey(maxNodes, maxLinks, typeKey, withPos), b, 0)
}

// EdgeBundle represents a bundled edge between two communities
type EdgeBundle struct {
	SourceCommunity int32    `json:"source_community"`
	TargetCommunity int32    `json:"target_community"`
	Weight          int32    `json:"weight"`
	AvgStrength     *float64 `json:"avg_strength,omitempty"`
	ControlPoint    *struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
		Z float64 `json:"z"`
	} `json:"control_point,omitempty"`
}

// EdgeBundlesResponse represents the response for edge bundles
type EdgeBundlesResponse struct {
	Bundles []EdgeBundle `json:"bundles"`
}

// GetEdgeBundles returns precomputed edge bundle metadata
// GET /api/graph/bundles?min_weight=1
func (h *Handler) GetEdgeBundles(w http.ResponseWriter, r *http.Request) {
	ctx, span := tracing.StartSpan(r.Context(), "handlers.GetEdgeBundles")
	defer span.End()

	cfg := config.Load()
	timeout := cfg.GraphQueryTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Parse min_weight parameter
	minWeight := parseIntDefault(r.URL.Query().Get("min_weight"), 1)
	if minWeight < 0 {
		minWeight = 0
	}
	// Clamp to MaxInt32 to prevent overflow when casting to int32
	if minWeight > math.MaxInt32 {
		minWeight = math.MaxInt32
	}

	// Check cache first
	cacheKeyStr := "bundles:" + strconv.Itoa(minWeight)
	now := time.Now()
	graphCacheMu.Lock()
	entry, found := graphCache[cacheKeyStr]
	if found && entry.expiresAt.After(now) {
		graphCacheMu.Unlock()
		metrics.APICacheHits.WithLabelValues("bundles").Inc()
		w.Header().Set("Content-Type", "application/json")
		w.Write(entry.data)
		return
	}
	graphCacheMu.Unlock()
	metrics.APICacheMisses.WithLabelValues("bundles").Inc()

	// Fetch bundles from database
	bundlesRows, err := h.queries.GetEdgeBundles(ctx, int32(minWeight))
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded || err == context.DeadlineExceeded {
			logger.WarnContext(ctx, "bundles query timed out", "timeout", timeout)
			apierr.WriteErrorWithContext(w, r, apierr.GraphTimeout("Bundles query timeout"))
			return
		}
		logger.ErrorContext(ctx, "failed to fetch edge bundles", "error", err)
		apierr.WriteErrorWithContext(w, r, apierr.GraphQueryFailed("Failed to fetch edge bundles"))
		return
	}

	// Build response
	bundles := make([]EdgeBundle, 0, len(bundlesRows))
	for _, row := range bundlesRows {
		bundle := EdgeBundle{
			SourceCommunity: row.SourceCommunityID,
			TargetCommunity: row.TargetCommunityID,
			Weight:          row.Weight,
		}

		if row.AvgStrength.Valid {
			strength := row.AvgStrength.Float64
			bundle.AvgStrength = &strength
		}

		if row.ControlX.Valid && row.ControlY.Valid && row.ControlZ.Valid {
			bundle.ControlPoint = &struct {
				X float64 `json:"x"`
				Y float64 `json:"y"`
				Z float64 `json:"z"`
			}{
				X: row.ControlX.Float64,
				Y: row.ControlY.Float64,
				Z: row.ControlZ.Float64,
			}
		}

		bundles = append(bundles, bundle)
	}

	resp := EdgeBundlesResponse{Bundles: bundles}
	b, _ := json.Marshal(resp)
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)

	// Store in cache
	graphCacheMu.Lock()
	graphCache[cacheKeyStr] = graphCacheEntry{data: b, expiresAt: time.Now().Add(graphCacheTTL)}
	graphCacheMu.Unlock()

	span.SetAttributes(
		attribute.Int("bundles_count", len(bundles)),
		attribute.Int("min_weight", minWeight),
	)
	span.SetStatus(codes.Ok, "bundles fetched successfully")
}
