import type { Env } from '../types/env';

function key(updateId: number) {
  return `update:${updateId}`;
}

/**
 * Returns true if this update_id has already been processed recently
 * (i.e. it's a Telegram retry of a webhook that timed out), and marks
 * it as seen for future calls. Uses a short TTL since Telegram only
 * retries within a limited window.
 */
export async function isDuplicateUpdate(env: Env, updateId: number): Promise<boolean> {
  const existing = await env.BOT_KV.get(key(updateId));
  if (existing) {
    return true;
  }
  await env.BOT_KV.put(key(updateId), '1', { expirationTtl: 600 });
  return false;
}
