import type { Env, KnownUser } from '../types/env';

export async function registerKnownUser(
  env: Env,
  userId: number,
  chatId: number,
  username?: string,
  firstName?: string
) {
  const existing = await getKnownUser(env, userId);
  const now = Date.now();

  const record: KnownUser = {
    userId,
    chatId,
    username,
    firstName,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now
  };

  await env.DB.prepare(
    `INSERT INTO known_users (user_id, chat_id, username, first_name, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username, first_name = excluded.first_name, last_seen_at = excluded.last_seen_at`
  )
    .bind(String(userId), String(chatId), username ?? null, firstName ?? null, record.firstSeenAt, record.lastSeenAt)
    .run();

  return record;
}

export async function getUserIndex(env: Env): Promise<number[]> {
  const rows = await env.DB.prepare('SELECT user_id FROM known_users').all<{ user_id: string }>();
  return (rows.results ?? []).map((r) => Number(r.user_id));
}

export async function getKnownUser(env: Env, userId: number): Promise<KnownUser | null> {
  const row = await env.DB.prepare('SELECT * FROM known_users WHERE user_id = ?')
    .bind(String(userId))
    .first<{ user_id: string; chat_id: string; username: string | null; first_name: string | null; first_seen_at: number; last_seen_at: number }>();

  if (!row) return null;
  return {
    userId: Number(row.user_id),
    chatId: Number(row.chat_id),
    username: row.username ?? undefined,
    firstName: row.first_name ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

export async function getAllKnownUsers(env: Env): Promise<KnownUser[]> {
  const rows = await env.DB.prepare('SELECT * FROM known_users').all<{ user_id: string; chat_id: string; username: string | null; first_name: string | null; first_seen_at: number; last_seen_at: number }>();
  return (rows.results ?? []).map((row) => ({
    userId: Number(row.user_id),
    chatId: Number(row.chat_id),
    username: row.username ?? undefined,
    firstName: row.first_name ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  }));
}
