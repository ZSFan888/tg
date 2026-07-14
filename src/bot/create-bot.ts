import { Bot, webhookCallback } from 'grammy';
import type { Env } from '../types/env';
import type { BotContext } from './context';
import { registerCommands } from '../handlers/commands';
import { registerCallbacks } from '../handlers/callbacks';
import { registerMessages } from '../handlers/messages';
import { registerAdminCommands } from '../handlers/admin';

export function createBot(env: Env) {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  bot.use(async (ctx, next) => {
    Object.assign(ctx, { env });
    await next();
  });

  registerCommands(bot);
  registerAdminCommands(bot);
  registerCallbacks(bot);
  registerMessages(bot);

  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return {
    bot,
    handleUpdate: webhookCallback(bot, 'cloudflare-mod')
  };
}
