import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReply } from '../services/ai';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPendingAction, clearPendingAction } from '../storage/pending-store';
import { setCustomPrompt } from '../storage/preferences-store';
import { incrementUsage } from '../storage/usage-store';
import { resolveSystemPrompt } from '../config/personas';
import { isUserAllowed } from '../utils/access';

export function registerMessages(bot: Bot<BotContext>) {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    if (!ctx.from) return;
    if (!isUserAllowed(ctx.env, ctx.from.id)) {
      await ctx.reply('抱歉，你没有使用这个机器人的权限。');
      return;
    }

    const pending = await getPendingAction(ctx.env, ctx.from.id);
    if (pending?.action === 'awaiting_custom_prompt') {
      await clearPendingAction(ctx.env, ctx.from.id);
      await setCustomPrompt(ctx.env, ctx.from.id, text);
      await ctx.reply('自定义提示词已保存，现在开始生效。使用 /settings 可以随时切回预设风格。');
      return;
    }

    const rate = await checkRateLimit(ctx.env, ctx.chat.id);
    if (!rate.ok) {
      await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
      return;
    }

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const { prompt } = resolveSystemPrompt(prefs);

    const history = await getChatHistory(ctx.env, ctx.chat.id);
    const reply = await generateReply(ctx.env, history, text, prompt);

    await ctx.reply(reply, {
      reply_parameters: {
        message_id: ctx.msg.message_id
      }
    });

    await saveChatHistory(ctx.env, ctx.chat.id, [
      ...history,
      { role: 'user', content: text },
      { role: 'assistant', content: reply }
    ]);

    await incrementUsage(ctx.env, ctx.from.id);
  });
}
