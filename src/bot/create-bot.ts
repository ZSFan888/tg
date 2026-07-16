import { Bot, webhookCallback } from 'grammy';
import type { Env } from '../types/env';
import type { BotContext } from './context';
import { registerCommands } from '../handlers/commands';
import { registerCallbacks } from '../handlers/callbacks';
import { registerMessages } from '../handlers/messages';

export function createBot(env: Env, waitUntil: (promise: Promise<unknown>) => void) {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    Object.assign(ctx, { env, waitUntil });
    await next();
  });

  registerCommands(bot);
  registerCallbacks(bot);
  registerMessages(bot);

  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return {
    bot,
    handleUpdate: webhookCallback(bot, 'cloudflare-mod', { timeoutMilliseconds: 60000 })
  };
}
