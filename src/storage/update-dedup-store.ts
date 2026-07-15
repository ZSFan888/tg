import type { Env } from '../types/env';

/**
 * Returns true if this update_id has already been processed recently
 * (i.e. it's a Telegram retry of a webhook that timed out), and marks
 * it as seen for future calls.
 *
 * Uses "INSERT OR IGNORE" + checking rows written instead of a separate
 * SELECT-then-INSERT, because the old two-step approach has a race
 * condition: if Telegram (or a slow response) causes two webhook calls
 * for the same update_id to run concurrently, both could pass the SELECT
 * check before either finishes the INSERT, and the message would still
 * get answered twice. A single atomic INSERT avoids that window entirely.
 */
export async function isDuplicateUpdate(env: Env, updateId: number): Promise<boolean> {
  const result = await env.DB.prepare(
    'INSERT OR IGNORE INTO update_dedup (update_id, seen_at) VALUES (?, ?)'
  )
    .bind(updateId, Date.now())
    .run();

  // meta.changes === 0 means the row already existed (INSERT was ignored),
  // i.e. this update_id was already processed before.
  return result.meta.changes === 0;
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
