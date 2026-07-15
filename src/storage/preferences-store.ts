import type { Env, PersonaKey, UserPreferences } from '../types/env';

const DEFAULT_PREFS: UserPreferences = { persona: 'default', updatedAt: 0 };

interface PrefsRow {
  user_id: string;
  persona: string;
  custom_prompt: string | null;
  model_id: string | null;
  active_task: string | null;
  voice_reply_enabled: number | null;
  voice_mode_enabled: number | null;
  auto_task_routing: number | null;
  debug_routing_enabled: number | null;
  updated_at: number;
}

function rowToPrefs(row: PrefsRow | null): UserPreferences {
  if (!row) return DEFAULT_PREFS;
  return {
    persona: row.persona as PersonaKey,
    customPrompt: row.custom_prompt ?? undefined,
    modelId: row.model_id ?? undefined,
    activeTask: (row.active_task as UserPreferences['activeTask']) ?? undefined,
    voiceReplyEnabled: row.voice_reply_enabled === null ? undefined : row.voice_reply_enabled === 1,
    voiceModeEnabled: row.voice_mode_enabled === null ? undefined : row.voice_mode_enabled === 1,
    autoTaskRouting: row.auto_task_routing === null ? undefined : row.auto_task_routing === 1,
    debugRoutingEnabled: row.debug_routing_enabled === null ? undefined : row.debug_routing_enabled === 1,
    updatedAt: row.updated_at
  };
}

function boolToInt(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

export async function getUserPreferences(env: Env, userId: number | string): Promise<UserPreferences> {
  const row = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ?')
    .bind(String(userId))
    .first<PrefsRow>();
  return rowToPrefs(row ?? null);
}

async function savePrefs(env: Env, userId: number | string, prefs: UserPreferences) {
  await env.DB.prepare(
    `INSERT INTO user_preferences (
      user_id, persona, custom_prompt, model_id, active_task,
      voice_reply_enabled, voice_mode_enabled, auto_task_routing, debug_routing_enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      persona = excluded.persona,
      custom_prompt = excluded.custom_prompt,
      model_id = excluded.model_id,
      active_task = excluded.active_task,
      voice_reply_enabled = excluded.voice_reply_enabled,
      voice_mode_enabled = excluded.voice_mode_enabled,
      auto_task_routing = excluded.auto_task_routing,
      debug_routing_enabled = excluded.debug_routing_enabled,
      updated_at = excluded.updated_at`
  )
    .bind(
      String(userId),
      prefs.persona,
      prefs.customPrompt ?? null,
      prefs.modelId ?? null,
      prefs.activeTask ?? null,
      boolToInt(prefs.voiceReplyEnabled),
      boolToInt(prefs.voiceModeEnabled),
      boolToInt(prefs.autoTaskRouting),
      boolToInt(prefs.debugRoutingEnabled),
      prefs.updatedAt
    )
    .run();
  return prefs;
}

export async function setUserPersona(env: Env, userId: number | string, persona: PersonaKey) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, persona, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}

export async function setCustomPrompt(env: Env, userId: number | string, customPrompt: string) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = {
    ...existing,
    persona: 'custom',
    customPrompt,
    updatedAt: Date.now()
  };
  return savePrefs(env, userId, prefs);
}

export async function setUserModel(env: Env, userId: number | string, modelId: string) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, modelId, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}

export async function setVoiceReplyEnabled(env: Env, userId: number | string, enabled: boolean) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, voiceReplyEnabled: enabled, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}

export async function setVoiceModeEnabled(env: Env, userId: number | string, enabled: boolean) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, voiceModeEnabled: enabled, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}

export async function setAutoTaskRouting(env: Env, userId: number | string, enabled: boolean) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, autoTaskRouting: enabled, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}

export async function setDebugRoutingEnabled(env: Env, userId: number | string, enabled: boolean) {
  const existing = await getUserPreferences(env, userId);
  const prefs: UserPreferences = { ...existing, debugRoutingEnabled: enabled, updatedAt: Date.now() };
  return savePrefs(env, userId, prefs);
}
