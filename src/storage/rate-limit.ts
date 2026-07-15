import type { Env } from '../types/env';

function limitPerMinute(env: Env) {
  const value = Number(env.RATE_LIMIT_PER_MINUTE ?? '12');
  return Number.isFinite(value) && value > 0 ? value : 12;
}

export async function checkRateLimit(env: Env, chatId: number | string) {
  const now = Date.now();
  const limit = limitPerMinute(env);
  const idKey = String(chatId);

  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE chat_id = ?')
    .bind(idKey)
    .first<{ count: number; reset_at: number }>();

  let nextCount: number;
  let nextResetAt: number;
  if (!row || now >= row.reset_at) {
    nextCount = 1;
    nextResetAt = now + 60_000;
  } else {
    nextCount = row.count + 1;
    nextResetAt = row.reset_at;
  }

  await env.DB.prepare(
    `INSERT INTO rate_limits (chat_id, count, reset_at) VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`
  )
    .bind(idKey, nextCount, nextResetAt)
    .run();

  return {
    ok: nextCount <= limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt: nextResetAt,
    limit
  };
}
