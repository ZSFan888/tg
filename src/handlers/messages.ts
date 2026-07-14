import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReply } from '../services/ai';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPersona } from '../config/personas';
import { isUserAllowed } from '../utils/access';

export function registerMessages(bot: Bot<BotContext>) {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    if (!isUserAllowed(ctx.env, ctx.from?.id)) {
      await ctx.reply('抱歉，你没有使用这个机器人的权限。');
      return;
    }

    const rate = await checkRateLimit(ctx.env, ctx.chat.id);
    if (!rate.ok) {
      await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
      return;
    }

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    const prefs = ctx.from ? await getUserPreferences(ctx.env, ctx.from.id) : { persona: 'default' as const };
    const persona = getPersona(prefs.persona);

    const history = await getChatHistory(ctx.env, ctx.chat.id);
    const reply = await generateReply(ctx.env, history, text, persona.prompt);

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
  });
}
