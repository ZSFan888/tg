import type { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import type { Env } from '../types/env';
import { resolveEnv } from '../storage/settings-store';
import { getSettingsOverride, updateSettingsOverride, resetSettingOverride, SETTINGS_META } from '../storage/settings-store';
import {
  hasAdminPassword,
  setAdminPassword,
  verifyAdminPassword,
  createAdminSession,
  validateAdminSession,
  destroyAdminSession
} from './auth-store';
import { getAllKnownUsers } from '../storage/users-store';
import { getGlobalStats, getStatsHistory, getModelStats, getUsage } from '../storage/usage-store';
import { clearChatHistory } from '../storage/chat-store';
import { getBanRecord, banUser, unbanUser } from '../storage/ban-store';
import { MODELS } from '../config/models';

const SESSION_COOKIE = 'admin_session';

async function requireAuth(env: Env, token: string | undefined): Promise<boolean> {
  return validateAdminSession(env, token);
}

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>) {
  app.get('/api/admin/auth/status', async (c) => {
    const initialized = await hasAdminPassword(c.env);
    const token = getCookie(c, SESSION_COOKIE);
    const loggedIn = initialized ? await requireAuth(c.env, token) : false;
    return c.json({ initialized, loggedIn });
  });

  app.post('/api/admin/auth/setup', async (c) => {
    const initialized = await hasAdminPassword(c.env);
    if (initialized) {
      return c.json({ ok: false, error: 'already_initialized' }, 400);
    }
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }));
    const password = body.password?.trim();
    if (!password || password.length < 6) {
      return c.json({ ok: false, error: 'password_too_short' }, 400);
    }
    await setAdminPassword(c.env, password);
    const token = await createAdminSession(c.env);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return c.json({ ok: true });
  });

  app.post('/api/admin/auth/login', async (c) => {
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }));
    const password = body.password?.trim();
    if (!password) {
      return c.json({ ok: false, error: 'missing_password' }, 400);
    }
    const valid = await verifyAdminPassword(c.env, password);
    if (!valid) {
      return c.json({ ok: false, error: 'invalid_password' }, 401);
    }
    const token = await createAdminSession(c.env);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return c.json({ ok: true });
  });

  app.post('/api/admin/auth/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await destroyAdminSession(c.env, token);
    setCookie(c, SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 0, path: '/' });
    return c.json({ ok: true });
  });

  app.use('/api/admin/*', async (c, next) => {
    if (c.req.path.startsWith('/api/admin/auth/')) return next();
    const token = getCookie(c, SESSION_COOKIE);
    const ok = await requireAuth(c.env, token);
    if (!ok) return c.json({ ok: false, error: 'unauthorized' }, 401);
    return next();
  });

  app.get('/api/admin/status', async (c) => {
    const env = await resolveEnv(c.env);
    const [globalStats, users] = await Promise.all([
      getGlobalStats(env),
      getAllKnownUsers(env)
    ]);

    let webhookInfo: { ok: boolean; url?: string; pending_update_count?: number } = { ok: false };
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`);
      const data = (await res.json()) as { ok: boolean; result?: { url?: string; pending_update_count?: number } };
      webhookInfo = { ok: data.ok, url: data.result?.url, pending_update_count: data.result?.pending_update_count };
    } catch {
      webhookInfo = { ok: false };
    }

    return c.json({
      ok: true,
      now: Date.now(),
      webhook: webhookInfo,
      totalUsers: users.length,
      todayMessages: globalStats.messageCount,
      currentModel: env.AI_MODEL,
      webSearchConfigured: Boolean(env.TAVILY_API_KEY),
      groupMentionRequired: env.GROUP_MENTION_REQUIRED === 'true',
      rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? '12'),
      maxHistory: Number(env.MAX_HISTORY ?? '8')
    });
  });

  app.get('/api/admin/stats', async (c) => {
    const env = await resolveEnv(c.env);
    const [history, modelStats] = await Promise.all([
      getStatsHistory(env),
      getModelStats(env)
    ]);
    return c.json({ ok: true, history, modelStats });
  });

  app.get('/api/admin/users', async (c) => {
    const env = await resolveEnv(c.env);
    const users = await getAllKnownUsers(env);
    const enriched = await Promise.all(
      users.map(async (u) => {
        const [usage, ban] = await Promise.all([
          getUsage(env, u.userId),
          getBanRecord(env, u.userId)
        ]);
        return { ...u, todayUsage: usage.count, banned: Boolean(ban), banUntil: ban?.until };
      })
    );
    enriched.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return c.json({ ok: true, users: enriched });
  });

  app.post('/api/admin/users/:userId/ban', async (c) => {
    const env = await resolveEnv(c.env);
    const userId = Number(c.req.param('userId'));
    const body = await c.req.json<{ minutes?: number; reason?: string }>().catch(() => ({} as { minutes?: number; reason?: string }));
    await banUser(env, userId, body.minutes, body.reason);
    return c.json({ ok: true });
  });

  app.post('/api/admin/users/:userId/unban', async (c) => {
    const env = await resolveEnv(c.env);
    const userId = Number(c.req.param('userId'));
    await unbanUser(env, userId);
    return c.json({ ok: true });
  });

  app.post('/api/admin/users/:userId/clear-history', async (c) => {
    const env = await resolveEnv(c.env);
    const userId = Number(c.req.param('userId'));
    const users = await getAllKnownUsers(env);
    const user = users.find((u) => u.userId === userId);
    if (!user) return c.json({ ok: false, error: 'user_not_found' }, 404);
    await clearChatHistory(env, user.chatId);
    return c.json({ ok: true });
  });

  app.post('/api/admin/history/clear-all', async (c) => {
    const env = await resolveEnv(c.env);
    const users = await getAllKnownUsers(env);
    const uniqueChatIds = Array.from(new Set(users.map((u) => u.chatId)));
    await Promise.all(uniqueChatIds.map((chatId) => clearChatHistory(env, chatId)));
    return c.json({ ok: true, clearedChats: uniqueChatIds.length });
  });

  app.get('/api/admin/settings', async (c) => {
    const override = await getSettingsOverride(c.env);
    const masked = { ...override };
    for (const meta of SETTINGS_META) {
      if (meta.sensitive && masked[meta.key]) {
        const value = masked[meta.key] as string;
        masked[meta.key] = value.length > 8 ? `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}` : '****';
      }
    }
    return c.json({ ok: true, meta: SETTINGS_META, values: masked, hasValue: Object.fromEntries(SETTINGS_META.map((m) => [m.key, Boolean(override[m.key])])) });
  });

  app.post('/api/admin/settings', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const next = await updateSettingsOverride(c.env, body);
    return c.json({ ok: true, values: next });
  });

  app.post('/api/admin/settings/:key/reset', async (c) => {
    const key = c.req.param('key') as any;
    const next = await resetSettingOverride(c.env, key);
    return c.json({ ok: true, values: next });
  });

  app.get('/api/admin/models', async (c) => {
    return c.json({ ok: true, models: MODELS });
  });
}
