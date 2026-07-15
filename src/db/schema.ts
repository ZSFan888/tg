import type { Env } from '../types/env';

// 建表语句和 schema.sql 保持一致，两者都是幂等的（IF NOT EXISTS），
// 所以可以在每次请求时"顺手"确保表存在，不需要额外的迁移工具或手动执行步骤。
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS chat_history (
    chat_id TEXT PRIMARY KEY,
    messages TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    chat_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS usage_daily (
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS global_stats (
    date TEXT PRIMARY KEY,
    message_count INTEGER NOT NULL,
    active_users INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS model_stats (
    model_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS neuron_daily (
    date TEXT PRIMARY KEY,
    total REAL NOT NULL,
    chat_calls INTEGER NOT NULL DEFAULT 0,
    audio_calls INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS anomaly_activity (
    user_id TEXT PRIMARY KEY,
    timestamps TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS anomaly_alerts (
    user_id TEXT PRIMARY KEY,
    alerted_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS update_dedup (
    update_id INTEGER PRIMARY KEY,
    seen_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    persona TEXT NOT NULL DEFAULT 'default',
    custom_prompt TEXT,
    model_id TEXT,
    active_task TEXT,
    voice_reply_enabled INTEGER,
    voice_mode_enabled INTEGER,
    auto_task_routing INTEGER,
    debug_routing_enabled INTEGER,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ban_records (
    user_id TEXT PRIMARY KEY,
    banned_at INTEGER NOT NULL,
    until INTEGER,
    reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pending_actions (
    user_id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    file_id TEXT,
    mime_type TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS followups (
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    questions TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, message_id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings_override (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS known_users (
    user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    username TEXT,
    first_name TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )`
];

// 进程内缓存，避免同一个 Worker 实例在其生命周期内重复对每个请求都跑一遍
// 建表语句。Worker 实例会被 Cloudflare 复用一段时间，这个缓存能省掉绝大多数
// 重复的 CREATE TABLE 调用；即使实例被回收重建，下一次请求会再跑一次，
// 因为语句本身是 IF NOT EXISTS，完全幂等，不会有副作用或报错。
let schemaEnsured = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (schemaEnsured) return;
  await Promise.all(STATEMENTS.map((sql) => env.DB.prepare(sql).run()));
  schemaEnsured = true;
}
