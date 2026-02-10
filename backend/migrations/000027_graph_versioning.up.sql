-- Track graph versions with monotonically increasing IDs
CREATE TABLE IF NOT EXISTS graph_versions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    node_count INTEGER DEFAULT 0 NOT NULL,
    link_count INTEGER DEFAULT 0 NOT NULL,
    status VARCHAR(20) DEFAULT 'completed' NOT NULL,
    precalc_duration_ms INTEGER DEFAULT 0,
    is_full_rebuild BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed'))
);

-- Index for querying recent versions
CREATE INDEX idx_graph_versions_created_at ON graph_versions(created_at DESC);
CREATE INDEX idx_graph_versions_status ON graph_versions(status);

-- Track changes between graph versions (diffs)
CREATE TABLE IF NOT EXISTS graph_diffs (
    id BIGSERIAL PRIMARY KEY,
    version_id BIGINT NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL,
    entity_type VARCHAR(10) NOT NULL,
    entity_id TEXT NOT NULL,
    old_val TEXT,
    new_val TEXT,
    old_pos_x DOUBLE PRECISION,
    old_pos_y DOUBLE PRECISION,
    old_pos_z DOUBLE PRECISION,
    new_pos_x DOUBLE PRECISION,
    new_pos_y DOUBLE PRECISION,
    new_pos_z DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT valid_action CHECK (action IN ('add', 'remove', 'update')),
    CONSTRAINT valid_entity_type CHECK (entity_type IN ('node', 'link'))
);

-- Indexes for efficient diff queries
CREATE INDEX idx_graph_diffs_version_id ON graph_diffs(version_id);
CREATE INDEX idx_graph_diffs_entity ON graph_diffs(entity_type, entity_id);
CREATE INDEX idx_graph_diffs_action ON graph_diffs(action);

-- Add version tracking to precalc_state
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'precalc_state' AND column_name = 'current_version_id') THEN
    ALTER TABLE precalc_state ADD COLUMN current_version_id BIGINT REFERENCES graph_versions(id);
  END IF;
END $$;

COMMENT ON TABLE graph_versions IS 'Tracks graph precalculation versions with timestamps and statistics';
COMMENT ON COLUMN graph_versions.id IS 'Monotonically increasing version ID';
COMMENT ON COLUMN graph_versions.status IS 'Version status: pending, completed, or failed';
COMMENT ON COLUMN graph_versions.is_full_rebuild IS 'True if this was a full rebuild vs incremental update';

COMMENT ON TABLE graph_diffs IS 'Stores differences between graph versions for incremental updates';
COMMENT ON COLUMN graph_diffs.action IS 'Type of change: add (new entity), remove (deleted entity), update (modified entity)';
COMMENT ON COLUMN graph_diffs.entity_type IS 'Type of entity: node or link';
COMMENT ON COLUMN graph_diffs.entity_id IS 'ID of the entity that changed';
COMMENT ON COLUMN graph_diffs.old_val IS 'Previous value for nodes (null for add/remove)';
COMMENT ON COLUMN graph_diffs.new_val IS 'New value for nodes (null for remove)';
