import type { Env, KnownUser } from '../types/env';

function key(userId: number | string) {
  return `user:${userId}`;
}

const INDEX_KEY = 'users:index';

export async function registerKnownUser(
  env: Env,
  userId: number,
  chatId: number,
  username?: string,
  firstName?: string
) {
  const existing = await env.BOT_KV.get(key(userId), 'json') as KnownUser | null;
  const now = Date.now();

  const record: KnownUser = {
    userId,
    chatId,
    username,
    firstName,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now
  };

  await env.BOT_KV.put(key(userId), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 180
  });

  if (!existing) {
    const index = await getUserIndex(env);
    if (!index.includes(userId)) {
      index.push(userId);
      await env.BOT_KV.put(INDEX_KEY, JSON.stringify(index));
    }
  }

  return record;
}

export async function getUserIndex(env: Env): Promise<number[]> {
  const raw = await env.BOT_KV.get(INDEX_KEY, 'json');
  return (raw as number[] | null) ?? [];
}

export async function getKnownUser(env: Env, userId: number): Promise<KnownUser | null> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  return (raw as KnownUser | null) ?? null;
}

export async function getAllKnownUsers(env: Env): Promise<KnownUser[]> {
  const index = await getUserIndex(env);
  const users: KnownUser[] = [];

  for (const userId of index) {
    const user = await getKnownUser(env, userId);
    if (user) users.push(user);
  }

  return users;
}
