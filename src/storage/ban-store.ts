import type { BanRecord, Env } from '../types/env';

export async function banUser(env: Env, userId: number, durationMinutes?: number, reason?: string) {
  const now = Date.now();
  const record: BanRecord = {
    userId,
    bannedAt: now,
    until: durationMinutes ? now + durationMinutes * 60 * 1000 : undefined,
    reason
  };

  await env.DB.prepare(
    `INSERT INTO ban_records (user_id, banned_at, until, reason) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET banned_at = excluded.banned_at, until = excluded.until, reason = excluded.reason`
  )
    .bind(String(userId), record.bannedAt, record.until ?? null, record.reason ?? null)
    .run();

  return record;
}

export async function unbanUser(env: Env, userId: number) {
  await env.DB.prepare('DELETE FROM ban_records WHERE user_id = ?').bind(String(userId)).run();
}

export async function getBanRecord(env: Env, userId: number): Promise<BanRecord | null> {
  const row = await env.DB.prepare('SELECT banned_at, until, reason FROM ban_records WHERE user_id = ?')
    .bind(String(userId))
    .first<{ banned_at: number; until: number | null; reason: string | null }>();

  if (!row) return null;

  const record: BanRecord = {
    userId,
    bannedAt: row.banned_at,
    until: row.until ?? undefined,
    reason: row.reason ?? undefined
  };

  if (record.until && Date.now() > record.until) {
    await unbanUser(env, userId);
    return null;
  }

  return record;
}

export async function isBanned(env: Env, userId: number): Promise<boolean> {
  const record = await getBanRecord(env, userId);
  return record !== null;
}
