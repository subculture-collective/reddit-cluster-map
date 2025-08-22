-- Drop overly wide btree index that fails for long TEXT values (e.g., full comment bodies)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i'
          AND c.relname = 'idx_graph_nodes_name'
    ) THEN
        EXECUTE 'DROP INDEX IF EXISTS idx_graph_nodes_name';
    END IF;
END $$;
