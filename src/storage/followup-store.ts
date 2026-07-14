import type { Env } from '../types/env';

function key(chatId: number, messageId: number) {
  return `followups:${chatId}:${messageId}`;
}

export async function saveFollowUps(env: Env, chatId: number, messageId: number, questions: string[]) {
  await env.BOT_KV.put(key(chatId, messageId), JSON.stringify(questions), {
    expirationTtl: 60 * 60 * 6
  });
}

export async function getFollowUps(env: Env, chatId: number, messageId: number): Promise<string[]> {
  const raw = await env.BOT_KV.get(key(chatId, messageId), 'json');
  return (raw as string[] | null) ?? [];
}
