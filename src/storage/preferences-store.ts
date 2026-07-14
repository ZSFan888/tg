import type { Env, PersonaKey, UserPreferences } from '../types/env';

function key(userId: number | string) {
  return `prefs:${userId}`;
}

const DEFAULT_PREFS: UserPreferences = { persona: 'default', updatedAt: 0 };

export async function getUserPreferences(env: Env, userId: number | string): Promise<UserPreferences> {
  const raw = await env.BOT_KV.get(key(userId), 'json');
  return (raw as UserPreferences | null) ?? DEFAULT_PREFS;
}

export async function setUserPersona(env: Env, userId: number | string, persona: PersonaKey) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, persona, updatedAt: Date.now() };
  await env.BOT_KV.put(key(userId), JSON.stringify(prefs), {
    expirationTtl: 60 * 60 * 24 * 90
  });
  return prefs;
}

export async function setCustomPrompt(env: Env, userId: number | string, customPrompt: string) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = {
    ...existing,
    persona: 'custom',
    customPrompt,
    updatedAt: Date.now()
  };
  await env.BOT_KV.put(key(userId), JSON.stringify(prefs), {
    expirationTtl: 60 * 60 * 24 * 90
  });
  return prefs;
}

export async function setUserModel(env: Env, userId: number | string, modelId: string) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, modelId, updatedAt: Date.now() };
  await env.BOT_KV.put(key(userId), JSON.stringify(prefs), {
    expirationTtl: 60 * 60 * 24 * 90
  });
  return prefs;
}
