import type { Env, PendingAction, PendingState } from '../types/env';

export async function setPendingAction(
  env: Env,
  userId: number | string,
  action: PendingAction,
  extras: Partial<PendingState> = {}
) {
  const state: PendingState = { action, createdAt: Date.now(), ...extras };
  await env.DB.prepare(
    `INSERT INTO pending_actions (user_id, action, created_at, file_id, mime_type) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET action = excluded.action, created_at = excluded.created_at, file_id = excluded.file_id, mime_type = excluded.mime_type`
  )
    .bind(String(userId), state.action, state.createdAt, state.fileId ?? null, state.mimeType ?? null)
    .run();
}

export async function getPendingAction(env: Env, userId: number | string): Promise<PendingState | null> {
  const row = await env.DB.prepare('SELECT action, created_at, file_id, mime_type FROM pending_actions WHERE user_id = ?')
    .bind(String(userId))
    .first<{ action: string; created_at: number; file_id: string | null; mime_type: string | null }>();

  if (!row) return null;

  if (Date.now() - row.created_at > 300_000) {
    await clearPendingAction(env, userId);
    return null;
  }

  return {
    action: row.action as PendingAction,
    createdAt: row.created_at,
    fileId: row.file_id ?? undefined,
    mimeType: row.mime_type ?? undefined
  };
}

export async function clearPendingAction(env: Env, userId: number | string) {
  await env.DB.prepare('DELETE FROM pending_actions WHERE user_id = ?').bind(String(userId)).run();
}
