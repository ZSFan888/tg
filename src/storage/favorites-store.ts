import type { Env, FavoriteEntry } from '../types/env';

function key(userId: number) {
  return `favorites:${userId}`;
}

const MAX_FAVORITES = 50;

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function addFavorite(env: Env, userId: number, question: string, answer: string): Promise<FavoriteEntry> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  const list = (raw as FavoriteEntry[] | null) ?? [];

  const entry: FavoriteEntry = {
    id: makeId(),
    question,
    answer,
    savedAt: Date.now()
  };

  const next = [entry, ...list].slice(0, MAX_FAVORITES);
  await env.BOT_KV.put(key(userId), JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 180
  });

  return entry;
}

export async function getFavorites(env: Env, userId: number): Promise<FavoriteEntry[]> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  return (raw as FavoriteEntry[] | null) ?? [];
}

export async function removeFavorite(env: Env, userId: number, id: string): Promise<boolean> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  const list = (raw as FavoriteEntry[] | null) ?? [];
  const next = list.filter((f) => f.id !== id);

  if (next.length === list.length) return false;

  await env.BOT_KV.put(key(userId), JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 180
  });
  return true;
}

export async function getFavoriteById(env: Env, userId: number, id: string): Promise<FavoriteEntry | null> {
  const list = await getFavorites(env, userId);
  return list.find((f) => f.id === id) ?? null;
}
