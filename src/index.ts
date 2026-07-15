import { Hono } from 'hono';
import type { Env } from './types/env';
import { createBot } from './bot/create-bot';
import { BOT_COMMANDS } from './bot/commands-menu';
import { resolveEnv } from './storage/settings-store';
import { registerAdminRoutes } from './admin/routes';
import { isDuplicateUpdate, pruneOldUpdates } from './storage/update-dedup-store';
import { ensureSchema } from './db/schema';

const app = new Hono<{ Bindings: Env }>();

// '/' 由 public/index.html 静态提供可视化状态页，此处仅保留健康检查 API
app.get('/healthz', async (c) => {
  await ensureSchema(c.env);
  return c.json({ ok: true, now: Date.now() });
});

app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const resolvedEnv = await resolveEnv(c.env);
  await ensureSchema(resolvedEnv);

  // Telegram 会在 webhook 响应超时（通常几秒）后重发同一个 update，
  // 如果不去重，AI 生成流程会被同一条消息触发两次，导致用户收到两次回答。
  const rawBody = await c.req.raw.clone().text();
  let updateId: number | undefined;
  try {
    const parsed = JSON.parse(rawBody) as { update_id?: number };
    updateId = parsed.update_id;
  } catch {
    updateId = undefined;
  }

  if (typeof updateId === 'number') {
    const duplicate = await isDuplicateUpdate(resolvedEnv, updateId);
    if (duplicate) {
      return c.text('OK (duplicate, skipped)', 200);
    }
    // D1 没有原生 TTL，这里用低概率随机触发清理，避免 update_dedup 表无限增长，
    // 又不需要额外配置 cron trigger。
    if (Math.random() < 0.02) {
      c.executionCtx.waitUntil(pruneOldUpdates(resolvedEnv));
    }
  }

  const { handleUpdate } = createBot(resolvedEnv, (p) => c.executionCtx.waitUntil(p));
  return handleUpdate(new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: rawBody
  }));
});

app.get('/setup-menu', async (c) => {
  const secret = c.req.query('secret');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const resolvedEnv = await resolveEnv(c.env);
  const { bot } = createBot(resolvedEnv, (p) => c.executionCtx.waitUntil(p));
  await bot.api.setMyCommands(BOT_COMMANDS);
  return c.json({ ok: true, commands: BOT_COMMANDS });
});

registerAdminRoutes(app);

export default app;
