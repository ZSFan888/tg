import type { Env, WarnState } from '../types/env';

function key(chatId: number | string, userId: number) {
  return `warn:${chatId}:${userId}`;
}

export async function getWarnCount(env: Env, chatId: number | string, userId: number) {
  const raw = await env.BOT_KV.get(key(chatId, userId), 'json');
  const state = raw as WarnState | null;
  return state?.count ?? 0;
}

export async function addWarning(env: Env, chatId: number | string, userId: number) {
  const current = await getWarnCount(env, chatId, userId);
  const next: WarnState = { count: current + 1, updatedAt: Date.now() };
  await env.BOT_KV.put(key(chatId, userId), JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 30
  });
  return next.count;
}

export async function resetWarnings(env: Env, chatId: number | string, userId: number) {
  await env.BOT_KV.delete(key(chatId, userId));
}
