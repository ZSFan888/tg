import type { Env, RateLimitState } from '../types/env';

function key(chatId: number | string) {
  return `rl:${chatId}`;
}

function limitPerMinute(env: Env) {
  const value = Number(env.RATE_LIMIT_PER_MINUTE ?? '12');
  return Number.isFinite(value) && value > 0 ? value : 12;
}

export async function checkRateLimit(env: Env, chatId: number | string) {
  const now = Date.now();
  const limit = limitPerMinute(env);
  const raw = await env.BOT_KV.get(key(chatId), 'json');
  const state = raw as RateLimitState | null;

  let nextState: RateLimitState;
  if (!state || now >= state.resetAt) {
    nextState = { count: 1, resetAt: now + 60_000 };
  } else {
    nextState = { count: state.count + 1, resetAt: state.resetAt };
  }

  await env.BOT_KV.put(key(chatId), JSON.stringify(nextState), {
    expirationTtl: 120
  });

  return {
    ok: nextState.count <= limit,
    remaining: Math.max(0, limit - nextState.count),
    resetAt: nextState.resetAt,
    limit
  };
}
