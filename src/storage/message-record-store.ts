import type { Env } from '../types/env';

function key(chatId: number, messageId: number) {
  return `msgrecord:${chatId}:${messageId}`;
}

export interface MessageRecord {
  question: string;
  answer: string;
}

export async function saveMessageRecord(env: Env, chatId: number, messageId: number, record: MessageRecord) {
  await env.BOT_KV.put(key(chatId, messageId), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 7
  });
}

export async function getMessageRecord(env: Env, chatId: number, messageId: number): Promise<MessageRecord | null> {
  const raw = await env.BOT_KV.get(key(chatId, messageId), 'json');
  return raw as MessageRecord | null;
}
