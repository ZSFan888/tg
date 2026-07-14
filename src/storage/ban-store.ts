import type { BanRecord, Env } from '../types/env';

function key(userId: number | string) {
  return `ban:${userId}`;
}

export async function banUser(env: Env, userId: number, durationMinutes?: number, reason?: string) {
  const now = Date.now();
  const record: BanRecord = {
    userId,
    bannedAt: now,
    until: durationMinutes ? now + durationMinutes * 60 * 1000 : undefined,
    reason
  };

  await env.BOT_KV.put(key(userId), JSON.stringify(record), {
    expirationTtl: durationMinutes ? durationMinutes * 60 + 60 : 60 * 60 * 24 * 365
  });

  return record;
}

export async function unbanUser(env: Env, userId: number) {
  await env.BOT_KV.delete(key(userId));
}

export async function getBanRecord(env: Env, userId: number): Promise<BanRecord | null> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  const record = raw as BanRecord | null;
  if (!record) return null;

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
