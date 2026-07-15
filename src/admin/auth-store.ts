import type { Env } from '../types/env';

const SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000;
const AUTH_ROW_ID = 1;

interface AuthRecord {
  passwordHash: string;
  salt: string;
  updatedAt: number;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return bufferToHex(derived);
}

async function getAuthRecord(env: Env): Promise<AuthRecord | null> {
  const row = await env.DB.prepare('SELECT password_hash, salt, updated_at FROM admin_auth WHERE id = ?')
    .bind(AUTH_ROW_ID)
    .first<{ password_hash: string; salt: string; updated_at: number }>();
  if (!row) return null;
  return { passwordHash: row.password_hash, salt: row.salt, updatedAt: row.updated_at };
}

export async function hasAdminPassword(env: Env): Promise<boolean> {
  const record = await getAuthRecord(env);
  return record !== null;
}

export async function setAdminPassword(env: Env, password: string): Promise<void> {
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare(
    `INSERT INTO admin_auth (id, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, updated_at = excluded.updated_at`
  )
    .bind(AUTH_ROW_ID, passwordHash, salt, Date.now())
    .run();
}

export async function verifyAdminPassword(env: Env, password: string): Promise<boolean> {
  const record = await getAuthRecord(env);
  if (!record) return false;
  const attemptHash = await hashPassword(password, record.salt);
  return attemptHash === record.passwordHash;
}

export async function createAdminSession(env: Env): Promise<string> {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)')
    .bind(token, Date.now())
    .run();
  return token;
}

export async function validateAdminSession(env: Env, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const row = await env.DB.prepare('SELECT created_at FROM admin_sessions WHERE token = ?')
    .bind(token)
    .first<{ created_at: number }>();
  if (!row) return false;
  if (Date.now() - row.created_at > SESSION_TTL_MS) {
    await destroyAdminSession(env, token);
    return false;
  }
  return true;
}

export async function destroyAdminSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
}
