import type { Env } from '../types/env';

/**
 * Returns true if this update_id has already been processed recently
 * (i.e. it's a Telegram retry of a webhook that timed out), and marks
 * it as seen for future calls.
 */
export async function isDuplicateUpdate(env: Env, updateId: number): Promise<boolean> {
  const existing = await env.DB.prepare('SELECT 1 FROM update_dedup WHERE update_id = ?')
    .bind(updateId)
    .first();

  if (existing) {
    return true;
  }

  await env.DB.prepare('INSERT INTO update_dedup (update_id, seen_at) VALUES (?, ?)')
    .bind(updateId, Date.now())
    .run();

  return false;
}

/**
 * Removes update_dedup rows older than the given TTL (in ms). Since D1 has
 * no native TTL, this should be called periodically (e.g. via a cron
 * trigger) to keep the table small.
 */
export async function pruneOldUpdates(env: Env, ttlMs = 600_000) {
  await env.DB.prepare('DELETE FROM update_dedup WHERE seen_at < ?')
    .bind(Date.now() - ttlMs)
    .run();
}
