import type { Env } from '../types/env';

export function parseCsvNumbers(input?: string): number[] {
  if (!input?.trim()) return [];
  return input
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function isChatAllowed(env: Env, chatId: number): boolean {
  const allowed = parseCsvNumbers(env.ALLOWED_CHAT_IDS);
  if (allowed.length === 0) return true;
  return allowed.includes(chatId);
}

export function isBotAdmin(env: Env, userId?: number): boolean {
  if (!userId) return false;
  const admins = parseCsvNumbers(env.ADMIN_USER_IDS);
  return admins.includes(userId);
}
