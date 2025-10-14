package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// list files under /app/backups with size and mtime
func ListBackups(w http.ResponseWriter, r *http.Request) {
    dir := "/app/backups"
    entries, err := os.ReadDir(dir)
    if err != nil {
        http.Error(w, "failed to read backups dir", http.StatusInternalServerError)
        return
    }
    type item struct {
        Name string `json:"name"`
        Size int64  `json:"size"`
        Mod  string `json:"modified"`
    }
    var out []item
    for _, e := range entries {
        if !e.Type().IsRegular() { continue }
        // Very basic allow-list for backup file names
        if !strings.HasPrefix(e.Name(), "reddit_cluster_") || !strings.HasSuffix(e.Name(), ".sql") {
            continue
        }
        fi, err := os.Stat(filepath.Join(dir, e.Name()))
        if err != nil { continue }
        out = append(out, item{Name: e.Name(), Size: fi.Size(), Mod: fi.ModTime().UTC().Format(time.RFC3339)})
    }
    // Sort newest first; filenames embed timestamp so lexicographic order works
    sort.Slice(out, func(i, j int) bool { return out[i].Name > out[j].Name })
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(out)
}

// stream a specific backup file by name
func DownloadBackup(w http.ResponseWriter, r *http.Request) {
    // Get {name} from route vars
    vars := mux.Vars(r)
    name := vars["name"]
    if name == "" {
        http.NotFound(w, r)
        return
    }
    name = filepath.Base(name)
    if name == "." || name == ".." { http.NotFound(w, r); return }
    if !strings.HasPrefix(name, "reddit_cluster_") || !strings.HasSuffix(name, ".sql") {
        http.Error(w, "invalid filename", http.StatusBadRequest)
        return
    }
    full := filepath.Clean(filepath.Join("/app/backups", name))
    // Ensure it stays within the backups dir
    if !strings.HasPrefix(full, "/app/backups/") {
        http.NotFound(w, r)
        return
    }
    f, err := os.Open(full)
    if err != nil {
        http.NotFound(w, r)
        return
    }
    defer f.Close()
    w.Header().Set("Content-Type", "application/sql")
    w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
    _, _ = io.Copy(w, f)
}
