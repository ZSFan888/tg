import { Hono } from 'hono';
import type { Env } from './types/env';
import { createBot } from './bot/create-bot';
import { BOT_COMMANDS } from './bot/commands-menu';
import { resolveEnv } from './storage/settings-store';
import { registerAdminRoutes } from './admin/routes';

const app = new Hono<{ Bindings: Env }>();

// '/' 由 public/index.html 静态提供可视化状态页，此处仅保留健康检查 API
app.get('/healthz', (c) => c.json({ ok: true, now: Date.now() }));

app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const resolvedEnv = await resolveEnv(c.env);
  const { handleUpdate } = createBot(resolvedEnv, (p) => c.executionCtx.waitUntil(p));
  return handleUpdate(c.req.raw);
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
