import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReply } from '../services/ai';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { isChatAllowed } from '../utils/access';
import { shouldReplyInGroup, stripBotMention } from '../utils/telegram';

export function registerMessages(bot: Bot<BotContext>) {
  bot.on('message:text', async (ctx) => {
    const rawText = ctx.message.text.trim();
    if (!rawText || rawText.startsWith('/')) return;
    if (!isChatAllowed(ctx.env, ctx.chat.id)) return;
    if (!shouldReplyInGroup(ctx)) return;

    const rate = await checkRateLimit(ctx.env, ctx.chat.id);
    if (!rate.ok) {
      await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
      return;
    }

    const text = stripBotMention(rawText, ctx.env.BOT_USERNAME);
    if (!text) return;

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    const history = await getChatHistory(ctx.env, ctx.chat.id);
    const reply = await generateReply(ctx.env, history, text);

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
