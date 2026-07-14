import type { Env } from '../types/env';

export function parseCsvNumbers(input?: string): number[] {
  if (!input?.trim()) return [];
  const normalized = input.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'any' || normalized === '*') return [];
  return input
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function isUserAllowedByEnv(env: Env, userId?: number): boolean {
  if (!userId) return false;
  const allowed = parseCsvNumbers(env.ALLOWED_USER_IDS);
  if (allowed.length === 0) return true;
  return allowed.includes(userId);
}

const APPROVED_KEY = 'access:approved-users';

export async function isUserAllowed(env: Env, userId?: number): Promise<boolean> {
  if (!userId) return false;
  if (isUserAllowedByEnv(env, userId)) return true;

  const raw = await env.BOT_KV.get(APPROVED_KEY, 'json');
  const approved = (raw as number[] | null) ?? [];
  return approved.includes(userId);
}

export async function approveUser(env: Env, userId: number) {
  const raw = await env.BOT_KV.get(APPROVED_KEY, 'json');
  const approved = (raw as number[] | null) ?? [];
  if (!approved.includes(userId)) {
    approved.push(userId);
    await env.BOT_KV.put(APPROVED_KEY, JSON.stringify(approved));
  }
}

export async function revokeUserApproval(env: Env, userId: number) {
  const raw = await env.BOT_KV.get(APPROVED_KEY, 'json');
  const approved = (raw as number[] | null) ?? [];
  const next = approved.filter((id) => id !== userId);
  await env.BOT_KV.put(APPROVED_KEY, JSON.stringify(next));
}

export function isAdmin(env: Env, userId?: number): boolean {
  if (!userId) return false;
  const admins = parseCsvNumbers(env.ADMIN_USER_IDS);
  return admins.includes(userId);
}
