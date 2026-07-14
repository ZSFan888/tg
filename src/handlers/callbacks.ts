import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import type { PersonaKey } from '../types/env';
import { clearChatHistory } from '../storage/chat-store';
import { getUserPreferences, setUserPersona } from '../storage/preferences-store';
import { setPendingAction } from '../storage/pending-store';
import { getUsage } from '../storage/usage-store';
import { listPersonas, resolveSystemPrompt } from '../config/personas';

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

  bot.callbackQuery('menu:usage', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();
    const usage = await getUsage(ctx.env, ctx.from.id);
    const limit = Number(ctx.env.RATE_LIMIT_PER_MINUTE ?? '12');
    await ctx.reply(`今日已使用：${usage.count} 次\n限流：每分钟最多 ${limit} 次`);
  });

  bot.callbackQuery('menu:settings', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const current = resolveSystemPrompt(prefs);

    const keyboard = new InlineKeyboard();
    for (const persona of listPersonas()) {
      const label = persona.key === prefs.persona ? `✓ ${persona.label}` : persona.label;
      keyboard.text(label, `persona:${persona.key}`).row();
    }
    keyboard.text(
      prefs.persona === 'custom' ? '✓ 自定义模式' : '自定义模式（输入你自己的提示词）',
      'menu:setprompt'
    );

    await ctx.reply(`当前回复风格：${current.label}\n选择一个新的风格：`, {
      reply_markup: keyboard
    });
  });

  bot.callbackQuery('menu:setprompt', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();
    await setPendingAction(ctx.env, ctx.from.id, 'awaiting_custom_prompt');
    await ctx.reply('请发送你想要的系统提示词（描述这个 AI 应该扮演什么角色、用什么语气回答）。5 分钟内有效。');
  });

  bot.callbackQuery(/^persona:(.+)$/, async (ctx) => {
    if (!ctx.from) return;
    const key = ctx.match?.[1] as PersonaKey;

    if (key === 'custom') {
      await ctx.answerCallbackQuery();
      return;
    }

    await setUserPersona(ctx.env, ctx.from.id, key);
    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const current = resolveSystemPrompt(prefs);

    await ctx.answerCallbackQuery({ text: `已切换到${current.label}` });
    await ctx.editMessageText(`回复风格已切换为：${current.label}`);
  });
}
