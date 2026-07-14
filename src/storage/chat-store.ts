import type { ChatMessage, ChatState, Env } from '../types/env';

function key(chatId: number | string) {
  return `chat:${chatId}`;
}

function maxHistory(env: Env) {
  const value = Number(env.MAX_HISTORY ?? '8');
  return Number.isFinite(value) && value > 0 ? value : 8;
}

export async function getChatHistory(env: Env, chatId: number | string): Promise<ChatMessage[]> {
  const raw = await env.BOT_KV.get(key(chatId), 'json');
  const state = raw as ChatState | null;
  return state?.messages ?? [];
}

export async function saveChatHistory(env: Env, chatId: number | string, messages: ChatMessage[]) {
  const trimmed = messages.slice(-maxHistory(env));
  const state: ChatState = {
    messages: trimmed,
    updatedAt: Date.now()
  };
  await env.BOT_KV.put(key(chatId), JSON.stringify(state), {
    expirationTtl: 60 * 60 * 24 * 7
  });
}

export async function clearChatHistory(env: Env, chatId: number | string) {
  await env.BOT_KV.delete(key(chatId));
}
