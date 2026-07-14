import type { Env, UsageState } from '../types/env';

function key(userId: number | string) {
  return `usage:${userId}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function incrementUsage(env: Env, userId: number | string) {
  const today = todayKey();
  const raw = await env.BOT_KV.get(key(userId), 'json');
  const state = raw as UsageState | null;

  const next: UsageState =
    state && state.date === today
      ? { date: today, count: state.count + 1 }
      : { date: today, count: 1 };

  await env.BOT_KV.put(key(userId), JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 2 });
  return next;
}

export async function getUsage(env: Env, userId: number | string): Promise<UsageState> {
  const today = todayKey();
  const raw = await env.BOT_KV.get(key(userId), 'json');
  const state = raw as UsageState | null;

  if (!state || state.date !== today) {
    return { date: today, count: 0 };
  }
  return state;
}
