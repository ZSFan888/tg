import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReplyStream } from '../services/ai';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPendingAction, clearPendingAction } from '../storage/pending-store';
import { setCustomPrompt } from '../storage/preferences-store';
import { incrementUsage } from '../storage/usage-store';
import { resolveSystemPrompt } from '../config/personas';
import { isUserAllowed } from '../utils/access';

const EDIT_INTERVAL_MS = 1400;
const TYPING_CURSOR = ' ▌';

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
    const modelId = prefs.modelId ?? ctx.env.AI_MODEL;

    const placeholder = await ctx.reply('思考中…', {
      reply_parameters: { message_id: ctx.msg.message_id }
    });

    let lastEditedText = '';
    let lastEditAt = 0;
    let editInFlight = false;

    async function flushEdit(displayText: string, force = false) {
      if (editInFlight) return;
      const now = Date.now();
      if (!force && now - lastEditAt < EDIT_INTERVAL_MS) return;
      if (displayText === lastEditedText) return;

      editInFlight = true;
      lastEditAt = now;
      lastEditedText = displayText;

      try {
        await ctx.api.editMessageText(ctx.chat.id, placeholder.message_id, displayText);
      } catch {
        // ignore transient edit failures (e.g. "message not modified")
      } finally {
        editInFlight = false;
      }
    }

    const finalText = await generateReplyStream(ctx.env, history, text, prompt, {
      onChunk: async (fullTextSoFar) => {
        const display = fullTextSoFar.length > 3800
          ? `${fullTextSoFar.slice(0, 3800)}…`
          : fullTextSoFar;
        await flushEdit(display + TYPING_CURSOR);
      },
      onDone: async (full) => {
        await flushEdit(full, true);
      },
      onError: async () => {
        await flushEdit('抱歉，AI 服务暂时出了点问题，请稍后再试。', true);
      }
    }, modelId);

    await saveChatHistory(ctx.env, ctx.chat.id, [
      ...history,
      { role: 'user', content: text },
      { role: 'assistant', content: finalText }
    ]);

    await incrementUsage(ctx.env, ctx.from.id);
  });
}
