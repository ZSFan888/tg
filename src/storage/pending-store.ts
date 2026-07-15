import type { Env, PendingAction, PendingState } from '../types/env';

function key(userId: number | string) {
  return `pending:${userId}`;
}

export async function setPendingAction(
  env: Env,
  userId: number | string,
  action: PendingAction,
  extras: Partial<PendingState> = {}
) {
  const state: PendingState = { action, createdAt: Date.now(), ...extras };
  await env.BOT_KV.put(key(userId), JSON.stringify(state), { expirationTtl: 300 });
}

export async function getPendingAction(env: Env, userId: number | string): Promise<PendingState | null> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  return (raw as PendingState | null) ?? null;
}

export async function clearPendingAction(env: Env, userId: number | string) {
  await env.BOT_KV.delete(key(userId));
}
