import type { Env } from '../types/env';

export async function saveFollowUps(env: Env, chatId: number, messageId: number, questions: string[]) {
  await env.DB.prepare(
    `INSERT INTO followups (chat_id, message_id, questions, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, message_id) DO UPDATE SET questions = excluded.questions, created_at = excluded.created_at`
  )
    .bind(String(chatId), String(messageId), JSON.stringify(questions), Date.now())
    .run();
}

export async function getFollowUps(env: Env, chatId: number, messageId: number): Promise<string[]> {
  const row = await env.DB.prepare('SELECT questions FROM followups WHERE chat_id = ? AND message_id = ?')
    .bind(String(chatId), String(messageId))
    .first<{ questions: string }>();

  if (!row) return [];
  try {
    return JSON.parse(row.questions) as string[];
  } catch {
    return [];
  }
}
