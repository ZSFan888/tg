import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { clearChatHistory } from '../storage/chat-store';

export function registerCommands(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('开始聊天', 'menu:chat')
      .text('清空上下文', 'menu:clear');

    await ctx.reply(
      '你好，我已经在线。\n直接给我发消息就能聊天，也可以用下方按钮。',
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply([
      '可用命令：',
      '/start - 打开欢迎菜单',
      '/chat - 提示进入聊天模式',
      '/clear - 清空当前会话上下文',
      '/model - 查看当前模型',
      '/ping - 健康检查'
    ].join('\n'));
  });

  bot.command('chat', async (ctx) => {
    await ctx.reply('进入聊天模式，直接发送你的问题即可。');
  });

  bot.command('model', async (ctx) => {
    await ctx.reply(`当前模型：${ctx.env.AI_MODEL}`);
  });

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  bot.command('clear', async (ctx) => {
    await clearChatHistory(ctx.env, ctx.chat.id);
    await ctx.reply('已清空当前会话上下文。');
  });
}
