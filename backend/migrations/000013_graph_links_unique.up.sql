-- ensure unique graph link pairs so inserts can be idempotent
ALTER TABLE graph_links
ADD CONSTRAINT graph_links_source_target_unique UNIQUE (source, target);
