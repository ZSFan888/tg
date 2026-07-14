import type { Env } from '../types/env';

const WINDOW_MS = 5 * 60 * 1000; // 5 分钟滑动窗口
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 同一用户 30 分钟内最多告警一次

function activityKey(userId: number | string) {
  return `anomaly:activity:${userId}`;
}

function alertKey(userId: number | string) {
  return `anomaly:alerted:${userId}`;
}

interface ActivityState {
  timestamps: number[];
}

/**
 * Records one request timestamp for the user and returns how many requests
 * happened within the trailing WINDOW_MS window (including this one).
 */
export async function recordActivityAndCount(env: Env, userId: number | string): Promise<number> {
  const now = Date.now();
  const raw = await env.BOT_KV.get(activityKey(userId), 'json');
  const state = (raw as ActivityState | null) ?? { timestamps: [] };

  const recent = state.timestamps.filter((t) => now - t < WINDOW_MS);
  recent.push(now);

  await env.BOT_KV.put(activityKey(userId), JSON.stringify({ timestamps: recent }), {
    expirationTtl: 60 * 10
  });

  return recent.length;
}

/**
 * Returns true if we should send an admin alert right now for this user
 * (i.e. we haven't already alerted about them within the cooldown window).
 * Also marks the alert as sent.
 */
export async function shouldAlertAndMark(env: Env, userId: number | string): Promise<boolean> {
  const now = Date.now();
  const raw = await env.BOT_KV.get(alertKey(userId), 'json');
  const last = raw as { at: number } | null;

  if (last && now - last.at < ALERT_COOLDOWN_MS) {
    return false;
  }

  await env.BOT_KV.put(alertKey(userId), JSON.stringify({ at: now }), {
    expirationTtl: 60 * 60
  });
  return true;
}
