import type { Env, UsageState } from '../types/env';
import { getAllKnownUsers } from './users-store';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function incrementUsage(env: Env, userId: number | string) {
  const today = todayKey();
  const idKey = String(userId);

  const row = await env.DB.prepare('SELECT count FROM usage_daily WHERE user_id = ? AND date = ?')
    .bind(idKey, today)
    .first<{ count: number }>();

  const nextCount = (row?.count ?? 0) + 1;

  await env.DB.prepare(
    `INSERT INTO usage_daily (user_id, date, count) VALUES (?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET count = excluded.count`
  )
    .bind(idKey, today, nextCount)
    .run();

  return { date: today, count: nextCount };
}

export async function getUsage(env: Env, userId: number | string): Promise<UsageState> {
  const today = todayKey();
  const row = await env.DB.prepare('SELECT count FROM usage_daily WHERE user_id = ? AND date = ?')
    .bind(String(userId), today)
    .first<{ count: number }>();
  return { date: today, count: row?.count ?? 0 };
}

const HISTORY_DAYS = 14;

export async function incrementGlobalStats(env: Env) {
  const today = todayKey();

  const row = await env.DB.prepare('SELECT message_count, active_users FROM global_stats WHERE date = ?')
    .bind(today)
    .first<{ message_count: number; active_users: number }>();

  const nextCount = (row?.message_count ?? 0) + 1;
  const activeUsers = row?.active_users ?? 0;

  await env.DB.prepare(
    `INSERT INTO global_stats (date, message_count, active_users) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET message_count = excluded.message_count`
  )
    .bind(today, nextCount, activeUsers)
    .run();

  return { date: today, messageCount: nextCount, activeUsers };
}

export async function getGlobalStats(env: Env) {
  const today = todayKey();
  const row = await env.DB.prepare('SELECT message_count, active_users FROM global_stats WHERE date = ?')
    .bind(today)
    .first<{ message_count: number; active_users: number }>();

  if (!row) {
    return rebuildTodayGlobalStatsFromUsers(env);
  }
  return { date: today, messageCount: row.message_count, activeUsers: row.active_users };
}

export async function getStatsHistory(env: Env): Promise<Array<{ date: string; messageCount: number }>> {
  const rows = await env.DB.prepare(
    'SELECT date, message_count FROM global_stats ORDER BY date DESC LIMIT ?'
  )
    .bind(HISTORY_DAYS)
    .all<{ date: string; message_count: number }>();

  return (rows.results ?? [])
    .map((r) => ({ date: r.date, messageCount: r.message_count }))
    .reverse();
}

export async function incrementModelUsage(env: Env, modelId: string) {
  const row = await env.DB.prepare('SELECT count FROM model_stats WHERE model_id = ?')
    .bind(modelId)
    .first<{ count: number }>();

  const nextCount = (row?.count ?? 0) + 1;

  await env.DB.prepare(
    `INSERT INTO model_stats (model_id, count) VALUES (?, ?)
     ON CONFLICT(model_id) DO UPDATE SET count = excluded.count`
  )
    .bind(modelId, nextCount)
    .run();
}

export async function getModelStats(env: Env): Promise<Record<string, number>> {
  const rows = await env.DB.prepare('SELECT model_id, count FROM model_stats').all<{ model_id: string; count: number }>();
  const stats: Record<string, number> = {};
  for (const r of rows.results ?? []) {
    stats[r.model_id] = r.count;
  }
  return stats;
}

export async function rebuildTodayGlobalStatsFromUsers(env: Env) {
  const today = todayKey();
  const users = await getAllKnownUsers(env);

  let total = 0;
  let activeUsers = 0;

  for (const user of users) {
    const usage = await getUsage(env, user.userId);
    if (usage.date === today && usage.count > 0) {
      total += usage.count;
      activeUsers += 1;
    }
  }

  const next = { date: today, messageCount: total, activeUsers };
  await env.DB.prepare(
    `INSERT INTO global_stats (date, message_count, active_users) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET message_count = excluded.message_count, active_users = excluded.active_users`
  )
    .bind(today, total, activeUsers)
    .run();

  return next;
}
