import type { AccessRequest, Env } from '../types/env';

function key(userId: number) {
  return `access-request:${userId}`;
}

const LIST_KEY = 'access-requests:pending';

export async function createAccessRequest(
  env: Env,
  userId: number,
  username?: string,
  firstName?: string
): Promise<AccessRequest> {
  const existing = await getAccessRequest(env, userId);
  if (existing) return existing;

  const request: AccessRequest = {
    userId,
    username,
    firstName,
    requestedAt: Date.now()
  };

  await env.BOT_KV.put(key(userId), JSON.stringify(request), {
    expirationTtl: 60 * 60 * 24 * 7
  });

  const raw = await env.BOT_KV.get(LIST_KEY, 'json');
  const list = (raw as number[] | null) ?? [];
  if (!list.includes(userId)) {
    list.push(userId);
    await env.BOT_KV.put(LIST_KEY, JSON.stringify(list), {
      expirationTtl: 60 * 60 * 24 * 7
    });
  }

  return request;
}

export async function getAccessRequest(env: Env, userId: number): Promise<AccessRequest | null> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  return raw as AccessRequest | null;
}

export async function clearAccessRequest(env: Env, userId: number) {
  await env.BOT_KV.delete(key(userId));

  const raw = await env.BOT_KV.get(LIST_KEY, 'json');
  const list = (raw as number[] | null) ?? [];
  const next = list.filter((id) => id !== userId);
  await env.BOT_KV.put(LIST_KEY, JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 7
  });
}

export async function getPendingRequests(env: Env): Promise<AccessRequest[]> {
  const raw = await env.BOT_KV.get(LIST_KEY, 'json');
  const list = (raw as number[] | null) ?? [];

  const requests = await Promise.all(list.map((id) => getAccessRequest(env, id)));
  return requests.filter((r): r is AccessRequest => r !== null);
}
