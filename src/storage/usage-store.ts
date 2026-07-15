import type { Env, KnownUser, UsageState } from '../types/env';

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

const GLOBAL_KEY = 'stats:global';
const HISTORY_KEY = 'stats:history';
const HISTORY_DAYS = 14;

export async function incrementGlobalStats(env: Env) {
  const today = todayKey();
  const raw = await env.BOT_KV.get(GLOBAL_KEY, 'json');
  const state = raw as { date: string; messageCount: number; activeUsers?: number } | null;

  const next =
    state && state.date === today
      ? { date: today, messageCount: state.messageCount + 1, activeUsers: state.activeUsers ?? 0 }
      : { date: today, messageCount: 1, activeUsers: 0 };

  await env.BOT_KV.put(GLOBAL_KEY, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 2 });
  await bumpHistory(env, today);
  return next;
}

export async function getGlobalStats(env: Env) {
  const today = todayKey();
  const raw = await env.BOT_KV.get(GLOBAL_KEY, 'json');
  const state = raw as { date: string; messageCount: number; activeUsers?: number } | null;

  if (!state || state.date !== today) {
    return rebuildTodayGlobalStatsFromUsers(env);
  }
  return state;
}

async function bumpHistory(env: Env, today: string) {
  const raw = await env.BOT_KV.get(HISTORY_KEY, 'json');
  const history = (raw as Array<{ date: string; messageCount: number }> | null) ?? [];

  const idx = history.findIndex((h) => h.date === today);
  if (idx >= 0) {
    history[idx].messageCount += 1;
  } else {
    history.push({ date: today, messageCount: 1 });
  }

  const trimmed = history
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-HISTORY_DAYS);

  await env.BOT_KV.put(HISTORY_KEY, JSON.stringify(trimmed), {
    expirationTtl: 60 * 60 * 24 * (HISTORY_DAYS + 5)
  });
}

export async function getStatsHistory(env: Env): Promise<Array<{ date: string; messageCount: number }>> {
  const raw = await env.BOT_KV.get(HISTORY_KEY, 'json');
  return (raw as Array<{ date: string; messageCount: number }> | null) ?? [];
}

const MODEL_STATS_KEY = 'stats:models';

export async function incrementModelUsage(env: Env, modelId: string) {
  const raw = await env.BOT_KV.get(MODEL_STATS_KEY, 'json');
  const stats = (raw as Record<string, number> | null) ?? {};

  stats[modelId] = (stats[modelId] ?? 0) + 1;

  await env.BOT_KV.put(MODEL_STATS_KEY, JSON.stringify(stats), {
    expirationTtl: 60 * 60 * 24 * 90
  });
}

export async function getModelStats(env: Env): Promise<Record<string, number>> {
  const raw = await env.BOT_KV.get(MODEL_STATS_KEY, 'json');
  return (raw as Record<string, number> | null) ?? {};
}


export async function rebuildTodayGlobalStatsFromUsers(env: Env) {
  const today = todayKey();
  const indexRaw = await env.BOT_KV.get('users:index', 'json');
  const userIds = (indexRaw as number[] | null) ?? [];
  let total = 0;
  let activeUsers = 0;

  for (const userId of userIds) {
    const userRaw = await env.BOT_KV.get(`user:${userId}`, 'json');
    const usageRaw = await env.BOT_KV.get(`usage:${userId}`, 'json');
    const user = userRaw as KnownUser | null;
    const usage = usageRaw as UsageState | null;
    if (usage && usage.date === today) {
      total += usage.count;
      if (usage.count > 0) activeUsers += 1;
    } else if (user) {
      const lastSeenDay = new Date(user.lastSeenAt).toISOString().slice(0, 10);
      if (lastSeenDay == today) activeUsers += 1;
    }
  }

  const next = { date: today, messageCount: total, activeUsers };
  await env.BOT_KV.put(GLOBAL_KEY, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 2 });
  return next;
}
