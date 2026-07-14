import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import type { PersonaKey } from '../types/env';
import { clearChatHistory } from '../storage/chat-store';
import { getUserPreferences, setUserPersona } from '../storage/preferences-store';
import { getPersona, listPersonas } from '../config/personas';

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

  bot.callbackQuery('menu:settings', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const current = getPersona(prefs.persona);

    const { InlineKeyboard } = await import('grammy');
    const keyboard = new InlineKeyboard();
    for (const persona of listPersonas()) {
      const label = persona.key === current.key ? `✓ ${persona.label}` : persona.label;
      keyboard.text(label, `persona:${persona.key}`).row();
    }

    await ctx.reply(`当前回复风格：${current.label}\n选择一个新的风格：`, {
      reply_markup: keyboard
    });
  });

  bot.callbackQuery(/^persona:(.+)$/, async (ctx) => {
    if (!ctx.from) return;
    const key = ctx.match?.[1] as PersonaKey;
    const persona = getPersona(key);

    await setUserPersona(ctx.env, ctx.from.id, persona.key);
    await ctx.answerCallbackQuery({ text: `已切换到${persona.label}` });
    await ctx.editMessageText(`回复风格已切换为：${persona.label}`);
  });
}
