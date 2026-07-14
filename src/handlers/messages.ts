import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReplyStream } from '../services/ai';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPendingAction, clearPendingAction } from '../storage/pending-store';
import { setCustomPrompt } from '../storage/preferences-store';
import { incrementUsage, incrementGlobalStats } from '../storage/usage-store';
import { registerKnownUser } from '../storage/users-store';
import { resolveSystemPrompt } from '../config/personas';
import { isUserAllowed } from '../utils/access';
import { searchWeb, buildSearchContext } from '../services/search';
import type { ChatMessage } from '../types/env';

const EDIT_INTERVAL_MS = 1400;
const TYPING_CURSOR = ' ▌';

interface RunAiTurnOptions {
  historyOverride?: ChatMessage[];
  isRegenerate?: boolean;
}

export async function runAiTurn(
  ctx: BotContext,
  chatId: number,
  userId: number,
  text: string,
  replyToMessageId: number | undefined,
  options: RunAiTurnOptions = {}
) {
  const rate = await checkRateLimit(ctx.env, chatId);
  if (!rate.ok) {
    await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
    return;
  }

  await ctx.api.sendChatAction(chatId, 'typing');

  const prefs = await getUserPreferences(ctx.env, userId);
  const { prompt: basePrompt } = resolveSystemPrompt(prefs);
  const history = options.historyOverride ?? (await getChatHistory(ctx.env, chatId));
  const modelId = prefs.modelId ?? ctx.env.AI_MODEL;

  const placeholder = await ctx.api.sendMessage(
    chatId,
    prefs.webSearchEnabled && ctx.env.TAVILY_API_KEY ? '🔍 正在联网搜索…' : '思考中…',
    replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined
  );

  let prompt = basePrompt;
  if (prefs.webSearchEnabled && ctx.env.TAVILY_API_KEY) {
    const searchOutcome = await searchWeb(ctx.env, text);
    const searchContext = buildSearchContext(searchOutcome, text);
    if (searchContext) {
      prompt = `${basePrompt}\n\n${searchContext}`;
    }
    await ctx.api.editMessageText(chatId, placeholder.message_id, '思考中…').catch(() => {});
  }

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
      await ctx.api.editMessageText(chatId, placeholder.message_id, displayText);
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

  const keyboard = new InlineKeyboard().text('🔄 重新生成', 'regen:last');
  try {
    await ctx.api.editMessageReplyMarkup(chatId, placeholder.message_id, {
      reply_markup: keyboard
    });
  } catch {
    // ignore if message content changed concurrently
  }

  await saveChatHistory(ctx.env, chatId, [
    ...history,
    { role: 'user', content: text },
    { role: 'assistant', content: finalText }
  ]);

  await incrementUsage(ctx.env, userId);
  await incrementGlobalStats(ctx.env);
}

export function registerMessages(bot: Bot<BotContext>) {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    if (!ctx.from) return;
    if (!isUserAllowed(ctx.env, ctx.from.id)) {
      await ctx.reply('抱歉，你没有使用这个机器人的权限。');
      return;
    }

    await registerKnownUser(
      ctx.env,
      ctx.from.id,
      ctx.chat.id,
      ctx.from.username,
      ctx.from.first_name
    );

    const pending = await getPendingAction(ctx.env, ctx.from.id);
    if (pending?.action === 'awaiting_custom_prompt') {
      await clearPendingAction(ctx.env, ctx.from.id);
      await setCustomPrompt(ctx.env, ctx.from.id, text);
      await ctx.reply('自定义提示词已保存，现在开始生效。使用 /settings 可以随时切回预设风格。');
      return;
    }

    await runAiTurn(ctx, ctx.chat.id, ctx.from.id, text, ctx.msg.message_id);
  });
}
