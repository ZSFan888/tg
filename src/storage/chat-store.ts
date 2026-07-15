import type { ChatMessage, Env } from '../types/env';

function maxHistory(env: Env) {
  const value = Number(env.MAX_HISTORY ?? '8');
  return Number.isFinite(value) && value > 0 ? value : 8;
}

export async function getChatHistory(env: Env, chatId: number | string): Promise<ChatMessage[]> {
  const row = await env.DB.prepare('SELECT messages FROM chat_history WHERE chat_id = ?')
    .bind(String(chatId))
    .first<{ messages: string }>();
  if (!row) return [];
  try {
    return JSON.parse(row.messages) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function saveChatHistory(env: Env, chatId: number | string, messages: ChatMessage[]) {
  const trimmed = messages.slice(-maxHistory(env));
  await env.DB.prepare(
    `INSERT INTO chat_history (chat_id, messages, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`
  )
    .bind(String(chatId), JSON.stringify(trimmed), Date.now())
    .run();
}

export async function clearChatHistory(env: Env, chatId: number | string) {
  await env.DB.prepare('DELETE FROM chat_history WHERE chat_id = ?').bind(String(chatId)).run();
}
