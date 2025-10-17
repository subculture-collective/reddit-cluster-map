package db

import (
	"context"
	"fmt"
	"strings"
)

// BatchUpsertGraphNodes performs a multi-row upsert for graph_nodes for the provided slice.
// It falls back to no-op if the slice is empty. Batch size limits the number of rows per statement.
func (q *Queries) BatchUpsertGraphNodes(ctx context.Context, nodes []BulkInsertGraphNodeParams, batchSize int) error {
    if len(nodes) == 0 {
        return nil
    }
    if batchSize <= 0 {
        batchSize = 1000
    }
    // Build batches
    for start := 0; start < len(nodes); start += batchSize {
        end := start + batchSize
        if end > len(nodes) {
            end = len(nodes)
        }
        batch := nodes[start:end]
        var sb strings.Builder
        sb.WriteString("INSERT INTO graph_nodes (id,name,val,type) VALUES ")
        args := make([]any, 0, len(batch)*4)
        for i, n := range batch {
            if i > 0 {
                sb.WriteByte(',')
            }
            idx := i*4 + 1
            sb.WriteString(fmt.Sprintf("($%d,$%d,$%d,$%d)", idx, idx+1, idx+2, idx+3))
            args = append(args, n.ID, n.Name, n.Val, n.Type)
        }
        sb.WriteString(" ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,val=EXCLUDED.val,type=EXCLUDED.type,updated_at=now()")
        if _, err := q.db.ExecContext(ctx, sb.String(), args...); err != nil {
            return err
        }
    }
    return nil
}

// BatchInsertGraphLinks inserts many graph_links rows with ON CONFLICT DO NOTHING semantics in batches.
// It de-duplicates (source,target) pairs client-side to reduce useless conflict checks.
func (q *Queries) BatchInsertGraphLinks(ctx context.Context, links []BulkInsertGraphLinkParams, batchSize int) error {
    if len(links) == 0 {
        return nil
    }
    if batchSize <= 0 {
        batchSize = 2000
    }
    // Deduplicate
    uniq := make(map[string]BulkInsertGraphLinkParams, len(links))
    for _, l := range links {
        key := l.Source + "\x00" + l.Target
        uniq[key] = l
    }
    dedup := make([]BulkInsertGraphLinkParams, 0, len(uniq))
    for _, v := range uniq {
        dedup = append(dedup, v)
    }
    // Batch insert using a VALUES table joined against graph_nodes to satisfy FKs
    for start := 0; start < len(dedup); start += batchSize {
        end := start + batchSize
        if end > len(dedup) {
            end = len(dedup)
        }
        batch := dedup[start:end]
        var sb strings.Builder
        sb.WriteString("WITH vals(source, target) AS (VALUES ")
        args := make([]any, 0, len(batch)*2)
        for i, l := range batch {
            if i > 0 { sb.WriteByte(',') }
            idx := i*2 + 1
            sb.WriteString(fmt.Sprintf("($%d,$%d)", idx, idx+1))
            args = append(args, l.Source, l.Target)
        }
        sb.WriteString(") INSERT INTO graph_links (source, target) ")
        sb.WriteString("SELECT v.source, v.target FROM vals v ")
        sb.WriteString("JOIN graph_nodes s ON s.id = v.source ")
        sb.WriteString("JOIN graph_nodes t ON t.id = v.target ")
        sb.WriteString("ON CONFLICT (source, target) DO NOTHING")
        if _, err := q.db.ExecContext(ctx, sb.String(), args...); err != nil {
            return err
        }
    }
    return nil
}
