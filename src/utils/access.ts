import type { Env } from '../types/env';

export function parseCsvNumbers(input?: string): number[] {
  if (!input?.trim()) return [];
  return input
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function isUserAllowed(env: Env, userId?: number): boolean {
  if (!userId) return false;
  const allowed = parseCsvNumbers(env.ALLOWED_USER_IDS);
  if (allowed.length === 0) return true;
  return allowed.includes(userId);
}
