import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { clearChatHistory } from '../storage/chat-store';

export function registerCallbacks(bot: Bot<BotContext>) {
  bot.callbackQuery('menu:chat', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('可以开始了，直接发送你的问题。');
  });

  bot.callbackQuery('menu:clear', async (ctx) => {
    await clearChatHistory(ctx.env, ctx.chat.id);
    await ctx.answerCallbackQuery({ text: '上下文已清空' });
    await ctx.reply('历史上下文已重置。');
  });
}
