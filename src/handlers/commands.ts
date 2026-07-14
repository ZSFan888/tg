import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { clearChatHistory } from '../storage/chat-store';
import { getUserPreferences } from '../storage/preferences-store';
import { getPersona, listPersonas } from '../config/personas';

export function registerCommands(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('开始聊天', 'menu:chat')
      .text('偏好设置', 'menu:settings')
      .row()
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
      '/settings - 切换回复风格',
      '/clear - 清空当前会话上下文',
      '/model - 查看当前模型',
      '/ping - 健康检查'
    ].join('\n'));
  });

  bot.command('chat', async (ctx) => {
    await ctx.reply('进入聊天模式，直接发送你的问题即可。');
  });

  bot.command('settings', async (ctx) => {
    if (!ctx.from) return;
    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const current = getPersona(prefs.persona);

    const keyboard = new InlineKeyboard();
    for (const persona of listPersonas()) {
      const label = persona.key === current.key ? `✓ ${persona.label}` : persona.label;
      keyboard.text(label, `persona:${persona.key}`).row();
    }

    await ctx.reply(`当前回复风格：${current.label}\n选择一个新的风格：`, {
      reply_markup: keyboard
    });
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
