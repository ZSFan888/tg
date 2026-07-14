import { Hono } from 'hono';
import type { Env } from './types/env';
import { createBot } from './bot/create-bot';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ ok: true, service: 'tg-cf-ai-bot' }));
app.get('/healthz', (c) => c.json({ ok: true, now: Date.now() }));

app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Unauthorized', 401);
  }

  const { handleUpdate } = createBot(c.env);
  return handleUpdate(c.req.raw);
});

export default app;
