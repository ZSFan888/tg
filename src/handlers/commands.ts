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
      '你好，我已经在线。\n你可以直接给我发消息聊天，也可以使用下方按钮。',
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply([
      '常用命令：',
      '/start - 打开欢迎菜单',
      '/chat - 提示进入聊天模式',
      '/clear - 清空当前会话上下文',
      '/model - 查看当前模型',
      '/ping - 健康检查',
      '',
      '群管理命令（需管理员权限，且需回复目标用户的消息）：',
      '/warn - 警告用户，达到上限自动移出',
      '/unwarn - 清空某用户警告',
      '/warnings - 查看警告次数',
      '/mute [时长] - 禁言，例如 /mute 10m',
      '/unmute - 解除禁言',
      '/ban - 移出群组',
      '/unban - 解封',
      '/kick - 踢出（可再次加入）'
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
