-- D1 schema for high-write-frequency data (migrated off KV to avoid the
-- 1,000-writes/day KV free-tier limit). Run once via:
--   npx wrangler d1 execute <DB_NAME> --file=./schema.sql
-- (or --remote for production)

CREATE TABLE IF NOT EXISTS chat_history (
  chat_id TEXT PRIMARY KEY,
  messages TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  chat_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS global_stats (
  date TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL,
  active_users INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS model_stats (
  model_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS neuron_daily (
  date TEXT PRIMARY KEY,
  total REAL NOT NULL,
  chat_calls INTEGER NOT NULL DEFAULT 0,
  audio_calls INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS anomaly_activity (
  user_id TEXT PRIMARY KEY,
  timestamps TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  user_id TEXT PRIMARY KEY,
  alerted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS update_dedup (
  update_id INTEGER PRIMARY KEY,
  seen_at INTEGER NOT NULL
);
