-- name: GetServiceSetting :one
SELECT value FROM service_settings WHERE key = $1;

-- name: UpsertServiceSetting :exec
INSERT INTO service_settings(key, value)
VALUES($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
