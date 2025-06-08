CREATE TABLE graph_data (
    id SERIAL PRIMARY KEY,
    data_type TEXT NOT NULL,
    node_id BIGINT,
    node_name TEXT,
    node_value INTEGER,
    node_type TEXT,
    source BIGINT,
    target BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 