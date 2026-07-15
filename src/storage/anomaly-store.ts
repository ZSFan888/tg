import type { Env } from '../types/env';

const WINDOW_MS = 5 * 60 * 1000; // 5 分钟滑动窗口
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 同一用户 30 分钟内最多告警一次

/**
 * Records one request timestamp for the user and returns how many requests
 * happened within the trailing WINDOW_MS window (including this one).
 */
export async function recordActivityAndCount(env: Env, userId: number | string): Promise<number> {
  const now = Date.now();
  const idKey = String(userId);

  const row = await env.DB.prepare('SELECT timestamps FROM anomaly_activity WHERE user_id = ?')
    .bind(idKey)
    .first<{ timestamps: string }>();

  const timestamps: number[] = row ? JSON.parse(row.timestamps) : [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);
  recent.push(now);

  await env.DB.prepare(
    `INSERT INTO anomaly_activity (user_id, timestamps) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET timestamps = excluded.timestamps`
  )
    .bind(idKey, JSON.stringify(recent))
    .run();

  return recent.length;
}

/**
 * Returns true if we should send an admin alert right now for this user
 * (i.e. we haven't already alerted about them within the cooldown window).
 * Also marks the alert as sent.
 */
export async function shouldAlertAndMark(env: Env, userId: number | string): Promise<boolean> {
  const now = Date.now();
  const idKey = String(userId);

  const row = await env.DB.prepare('SELECT alerted_at FROM anomaly_alerts WHERE user_id = ?')
    .bind(idKey)
    .first<{ alerted_at: number }>();

  if (row && now - row.alerted_at < ALERT_COOLDOWN_MS) {
    return false;
  }

  await env.DB.prepare(
    `INSERT INTO anomaly_alerts (user_id, alerted_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET alerted_at = excluded.alerted_at`
  )
    .bind(idKey, now)
    .run();

  return true;
}
