import type { Env } from '../types/env';

const AUTH_KEY = 'admin:auth';
const SESSION_PREFIX = 'admin:session:';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

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

export async function hasAdminPassword(env: Env): Promise<boolean> {
  const raw = await env.BOT_KV.get(AUTH_KEY, 'json');
  return raw !== null;
}

export async function setAdminPassword(env: Env, password: string): Promise<void> {
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const record: AuthRecord = { passwordHash, salt, updatedAt: Date.now() };
  await env.BOT_KV.put(AUTH_KEY, JSON.stringify(record));
}

export async function verifyAdminPassword(env: Env, password: string): Promise<boolean> {
  const raw = await env.BOT_KV.get(AUTH_KEY, 'json');
  const record = raw as AuthRecord | null;
  if (!record) return false;
  const attemptHash = await hashPassword(password, record.salt);
  return attemptHash === record.passwordHash;
}

export async function createAdminSession(env: Env): Promise<string> {
  const token = randomHex(32);
  await env.BOT_KV.put(
    `${SESSION_PREFIX}${token}`,
    JSON.stringify({ createdAt: Date.now() }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );
  return token;
}

export async function validateAdminSession(env: Env, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const raw = await env.BOT_KV.get(`${SESSION_PREFIX}${token}`);
  return raw !== null;
}

export async function destroyAdminSession(env: Env, token: string): Promise<void> {
  await env.BOT_KV.delete(`${SESSION_PREFIX}${token}`);
}
