import type { Env } from '../types/env';

/**
 * Neurons-per-million-token rates, sourced from Cloudflare's published
 * pricing table (developers.cloudflare.com/workers-ai/platform/pricing/).
 * Used to estimate (not exact-bill) Neuron consumption per AI call, since
 * Workers AI does not expose a live "Neurons used today" query API.
 */
const MODEL_NEURON_RATES: Record<string, { input: number; output: number }> = {
  '@cf/meta/llama-3.2-1b-instruct': { input: 2457, output: 18252 },
  '@cf/meta/llama-3.2-3b-instruct': { input: 4625, output: 30475 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { input: 4119, output: 34868 },
  '@cf/meta/llama-3.1-8b-instruct-fast': { input: 4119, output: 34868 },
  '@cf/meta/llama-3.1-8b-instruct-fp8': { input: 13778, output: 26128 },
  '@cf/meta/llama-3.1-8b-instruct': { input: 25608, output: 75147 },
  '@cf/meta/llama-3.1-70b-instruct-fp8-fast': { input: 26668, output: 204805 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { input: 26668, output: 204805 },
  '@cf/meta/llama-4-scout-17b-16e-instruct': { input: 24545, output: 77273 },
  '@cf/qwen/qwen3-30b-a3b-fp8': { input: 4625, output: 30475 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { input: 31876, output: 50488 }
};

const DEFAULT_RATE = { input: 25000, output: 75000 };

// Audio model Neurons per minute (whisper transcription, melotts TTS)
export const WHISPER_NEURONS_PER_MINUTE = 46.63;
export const MELOTTS_NEURONS_PER_MINUTE = 18.63;

export function estimateChatNeurons(modelId: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_NEURON_RATES[modelId] ?? DEFAULT_RATE;
  return (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
}

const DAILY_FREE_NEURONS = 10000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

interface NeuronDailyState {
  date: string;
  total: number;
  chatCalls: number;
  audioCalls: number;
}

export async function recordNeuronUsage(env: Env, amount: number, kind: 'chat' | 'audio' = 'chat') {
  const today = todayKey();

  const row = await env.DB.prepare('SELECT total, chat_calls, audio_calls FROM neuron_daily WHERE date = ?')
    .bind(today)
    .first<{ total: number; chat_calls: number; audio_calls: number }>();

  const total = (row?.total ?? 0) + amount;
  const chatCalls = (row?.chat_calls ?? 0) + (kind === 'chat' ? 1 : 0);
  const audioCalls = (row?.audio_calls ?? 0) + (kind === 'audio' ? 1 : 0);

  await env.DB.prepare(
    `INSERT INTO neuron_daily (date, total, chat_calls, audio_calls) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total = excluded.total, chat_calls = excluded.chat_calls, audio_calls = excluded.audio_calls`
  )
    .bind(today, total, chatCalls, audioCalls)
    .run();

  return { date: today, total, chatCalls, audioCalls };
}

export async function getTodayNeuronUsage(env: Env): Promise<NeuronDailyState> {
  const today = todayKey();
  const row = await env.DB.prepare('SELECT total, chat_calls, audio_calls FROM neuron_daily WHERE date = ?')
    .bind(today)
    .first<{ total: number; chat_calls: number; audio_calls: number }>();

  if (!row) return { date: today, total: 0, chatCalls: 0, audioCalls: 0 };
  return { date: today, total: row.total, chatCalls: row.chat_calls, audioCalls: row.audio_calls };
}

export async function getNeuronUsageHistory(env: Env, days = 7): Promise<NeuronDailyState[]> {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const rows = await env.DB.prepare(
    `SELECT date, total, chat_calls, audio_calls FROM neuron_daily WHERE date IN (${dates.map(() => '?').join(',')})`
  )
    .bind(...dates)
    .all<{ date: string; total: number; chat_calls: number; audio_calls: number }>();

  const byDate = new Map((rows.results ?? []).map((r) => [r.date, r]));

  const results = dates.map((date) => {
    const r = byDate.get(date);
    return r
      ? { date, total: r.total, chatCalls: r.chat_calls, audioCalls: r.audio_calls }
      : { date, total: 0, chatCalls: 0, audioCalls: 0 };
  });

  return results.reverse();
}

export function projectDepletionHour(usedSoFar: number): { willExhaustToday: boolean; estimatedExhaustionHourUtc: number | null } {
  const now = new Date();
  const hoursElapsedUtc = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (hoursElapsedUtc < 0.25 || usedSoFar <= 0) {
    return { willExhaustToday: false, estimatedExhaustionHourUtc: null };
  }
  const ratePerHour = usedSoFar / hoursElapsedUtc;
  if (ratePerHour <= 0) {
    return { willExhaustToday: false, estimatedExhaustionHourUtc: null };
  }
  const remaining = DAILY_FREE_NEURONS - usedSoFar;
  if (remaining <= 0) {
    return { willExhaustToday: true, estimatedExhaustionHourUtc: hoursElapsedUtc };
  }
  const hoursUntilExhaustion = remaining / ratePerHour;
  const exhaustionHour = hoursElapsedUtc + hoursUntilExhaustion;
  return {
    willExhaustToday: exhaustionHour <= 24,
    estimatedExhaustionHourUtc: exhaustionHour <= 24 ? exhaustionHour : null
  };
}

export const DAILY_FREE_NEURONS_CONST = DAILY_FREE_NEURONS;
