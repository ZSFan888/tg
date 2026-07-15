import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReplyStream } from '../services/ai';
import { generateFollowUps } from '../services/followups';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPendingAction, clearPendingAction } from '../storage/pending-store';
import { setCustomPrompt } from '../storage/preferences-store';
import { incrementUsage, incrementGlobalStats, incrementModelUsage } from '../storage/usage-store';
import { registerKnownUser } from '../storage/users-store';
import { saveFollowUps } from '../storage/followup-store';
import { getBanRecord } from '../storage/ban-store';
import { sanitizeMarkdown } from '../utils/markdown';
import { transcribeAudio } from '../services/transcribe';
import { resolveSystemPrompt } from '../config/personas';
import { searchWeb, buildSearchContext } from '../services/search';
import { recordNeuronUsage, estimateChatNeurons, WHISPER_NEURONS_PER_MINUTE } from '../storage/neurons-store';
import { recordActivityAndCount, shouldAlertAndMark } from '../storage/anomaly-store';
import { parseCsvNumbers } from '../utils/access';
import type { ChatMessage } from '../types/env';

// Telegram 对同一条消息的 editMessageText 大约限制在每秒 1 次左右，
// 太频繁会触发 429。这里设为略高于 1 秒的安全值，在不被限流的前提下
// 尽量提高刷新频率，让文字看起来更连续。
const EDIT_INTERVAL_MS = 1100;
const TYPING_CURSOR = ' ▌';

// 把「网络一次性吐出一大段文字」的效果，拆成多次小幅增量显示，
// 模拟打字机逐字出现的效果，而不是一顿一顿地跳字。
const REVEAL_TICK_MS = 220;
// 每次最多追赶已收到内容差距的这个比例，差距越大追得越快，
// 保证不会因为追字速度太慢导致长回答显示严重滞后于实际生成进度。
const REVEAL_CATCHUP_RATIO = 0.35;
// 无论差距大小，每次至少往前露出这么多字符，避免长时间停滞不前。
const REVEAL_MIN_CHARS = 2;

interface RunAiTurnOptions {
  historyOverride?: ChatMessage[];
  isRegenerate?: boolean;
  editedNotice?: boolean;
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

  // 异常检测：5 分钟内请求次数超过阈值时，通知管理员（同一用户 30 分钟内最多告警一次）。
  const ANOMALY_THRESHOLD = 20;
  const recentCount = await recordActivityAndCount(ctx.env, userId);
  if (recentCount >= ANOMALY_THRESHOLD) {
    const shouldAlert = await shouldAlertAndMark(ctx.env, userId);
    if (shouldAlert) {
      const admins = parseCsvNumbers(ctx.env.ADMIN_USER_IDS);
      const alertText = `⚠ 异常请求告警\n用户 ${userId} 在 5 分钟内发起了 ${recentCount} 次请求，可能存在滥用或攻击行为。\n可使用 /ban ${userId} 30 异常请求 进行临时禁用。`;
      for (const adminId of admins) {
        ctx.api.sendMessage(adminId, alertText).catch(() => {});
      }
    }
  }

  await ctx.api.sendChatAction(chatId, 'typing');

  let typingActive = true;
  const typingInterval = setInterval(() => {
    if (!typingActive) return;
    ctx.api.sendChatAction(chatId, 'typing').catch(() => {});
  }, 4000);

  const [prefs, historyFromStore] = await Promise.all([
    getUserPreferences(ctx.env, userId),
    options.historyOverride ? Promise.resolve(options.historyOverride) : getChatHistory(ctx.env, chatId)
  ]);
  const { prompt: basePrompt } = resolveSystemPrompt(prefs);
  const history = historyFromStore;
  const modelId = prefs.modelId ?? ctx.env.AI_MODEL;

  const willSearch = prefs.webSearchEnabled && Boolean(ctx.env.TAVILY_API_KEY);
  let placeholderBase = options.editedNotice
    ? '· 检测到消息已编辑，重新生成回答'
    : (willSearch ? '· 正在联网搜索' : '思考中');

  const placeholder = await ctx.api.sendMessage(
    chatId,
    `${placeholderBase}…`,
    replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined
  );

  const DOT_FRAMES = ['', '.', '..', '...'];
  let dotFrame = 0;
  let placeholderActive = true;
  const placeholderInterval = setInterval(() => {
    if (!placeholderActive) return;
    dotFrame = (dotFrame + 1) % DOT_FRAMES.length;
    ctx.api
      .editMessageText(chatId, placeholder.message_id, `${placeholderBase}${DOT_FRAMES[dotFrame]}`)
      .catch(() => {});
  }, 900);

  let prompt = basePrompt;
  if (willSearch) {
    const searchOutcome = await searchWeb(ctx.env, text);
    const searchContext = buildSearchContext(searchOutcome, text);
    if (searchContext) {
      prompt = `${basePrompt}\n\n${searchContext}`;
    }
    placeholderBase = '思考中';
    dotFrame = 0;
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

  // 打字机效果：目标文本（targetText）由 AI 流式返回随时更新，实际展示
  // 的文本（revealedLength）通过独立的定时器逐步逼近目标，而不是每次
  // 收到网络分片就立刻整段刷屏。这样即使上游一次性推来一大段文字，
  // 用户看到的也是均匀、连续地往前吐字，而不是一顿一顿地跳动。
  let targetText = '';
  let revealedLength = 0;
  let streamDone = false;
  let revealTicking = false;

  async function revealTick(force = false) {
    if (revealTicking) return;
    revealTicking = true;
    try {
      if (revealedLength < targetText.length) {
        const remaining = targetText.length - revealedLength;
        const step = Math.max(
          REVEAL_MIN_CHARS,
          Math.ceil(remaining * REVEAL_CATCHUP_RATIO)
        );
        revealedLength = Math.min(targetText.length, revealedLength + step);
      }
      const visible = targetText.slice(0, revealedLength);
      const clean = sanitizeMarkdown(visible);
      const display = clean.length > 3800 ? `${clean.slice(0, 3800)}…` : clean;
      const isFinished = streamDone && revealedLength >= targetText.length;
      await flushEdit(isFinished ? display : `${display}${TYPING_CURSOR}`, force || isFinished);
    } finally {
      revealTicking = false;
    }
  }

  const revealInterval = setInterval(() => {
    revealTick().catch(() => {});
  }, REVEAL_TICK_MS);

  const { text: finalText, usage: chatUsage } = await generateReplyStream(ctx.env, history, text, prompt, {
    onChunk: async (fullTextSoFar) => {
      if (placeholderActive) {
        placeholderActive = false;
        clearInterval(placeholderInterval);
      }
      targetText = fullTextSoFar;
    },
    onDone: async (full) => {
      placeholderActive = false;
      clearInterval(placeholderInterval);
      targetText = full;
      streamDone = true;
      clearInterval(revealInterval);
      revealedLength = targetText.length;
      await flushEdit(sanitizeMarkdown(targetText), true);
    },
    onError: async () => {
      placeholderActive = false;
      clearInterval(placeholderInterval);
      streamDone = true;
      clearInterval(revealInterval);
      await flushEdit('抱歉，AI 服务暂时出了点问题，请稍后再试。', true);
    }
  }, modelId);

  clearInterval(revealInterval);

  const cleanFinalText = sanitizeMarkdown(finalText);

  typingActive = false;
  clearInterval(typingInterval);

  const keyboard = new InlineKeyboard()
    .text('› 重新生成', 'regen:last')
    .row()
    .text('· 追问生成中…', 'noop');
  try {
    await ctx.api.editMessageReplyMarkup(chatId, placeholder.message_id, {
      reply_markup: keyboard
    });
  } catch {
    // ignore if message content changed concurrently
  }

  await Promise.all([
    saveChatHistory(ctx.env, chatId, [
      ...history,
      { role: 'user', content: text },
      { role: 'assistant', content: cleanFinalText }
    ]),
    incrementUsage(ctx.env, userId),
    incrementGlobalStats(ctx.env),
    incrementModelUsage(ctx.env, modelId),
    recordNeuronUsage(ctx.env, estimateChatNeurons(modelId, chatUsage.promptTokens, chatUsage.completionTokens), 'chat')
  ]);

  ctx.waitUntil(
    generateFollowUps(ctx.env, text, cleanFinalText, modelId)
    .then(async (questions) => {
      const followKeyboard = new InlineKeyboard().text('› 重新生成', 'regen:last');

      if (questions.length === 0) {
        await ctx.api.editMessageReplyMarkup(chatId, placeholder.message_id, {
          reply_markup: followKeyboard
        }).catch(() => {});
        return;
      }

      await saveFollowUps(ctx.env, chatId, placeholder.message_id, questions);

      questions.forEach((q, i) => {
        followKeyboard.row().text(q, `followup:${placeholder.message_id}:${i}`);
      });

      await ctx.api.editMessageReplyMarkup(chatId, placeholder.message_id, {
        reply_markup: followKeyboard
      }).catch(() => {});
    })
    .catch(async () => {
      const fallbackKeyboard = new InlineKeyboard().text('› 重新生成', 'regen:last');
      await ctx.api.editMessageReplyMarkup(chatId, placeholder.message_id, {
        reply_markup: fallbackKeyboard
      }).catch(() => {});
    })
  );
}

export function registerMessages(bot: Bot<BotContext>) {
  bot.on(['message:text', 'edited_message:text'], async (ctx) => {
    const rawText = ctx.message?.text ?? ctx.editedMessage?.text ?? '';
    const text = rawText.trim();
    const isEdited = !ctx.message && !!ctx.editedMessage;
    if (!text || text.startsWith('/')) return;
    if (!ctx.from) return;
    if (!ctx.chat) return;

    const ban = await getBanRecord(ctx.env, ctx.from.id);
    if (ban) {
      if (!isEdited) {
        const until = ban.until ? new Date(ban.until).toLocaleString('zh-CN') : '永久';
        await ctx.reply(`你已被限制使用这个机器人。\n解除时间：${until}${ban.reason ? `\n原因：${ban.reason}` : ''}`);
      }
      return;
    }

    await registerKnownUser(
      ctx.env,
      ctx.from.id,
      ctx.chat.id,
      ctx.from.username,
      ctx.from.first_name
    );

    if (!isEdited) {
      const pending = await getPendingAction(ctx.env, ctx.from.id);
      if (pending?.action === 'awaiting_custom_prompt') {
        await clearPendingAction(ctx.env, ctx.from.id);
        await setCustomPrompt(ctx.env, ctx.from.id, text);
        await ctx.reply('自定义提示词已保存，现在开始生效。使用 /settings 可以随时切回预设风格。');
        return;
      }
    }

    const messageId = ctx.message?.message_id ?? ctx.editedMessage?.message_id;
    await runAiTurn(ctx, ctx.chat.id, ctx.from.id, text, messageId, { editedNotice: isEdited });
  });

  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    if (!ctx.from || !ctx.chat) return;

    const ban = await getBanRecord(ctx.env, ctx.from.id);
    if (ban) {
      const until = ban.until ? new Date(ban.until).toLocaleString('zh-CN') : '永久';
      await ctx.reply(`你已被限制使用这个机器人。\n解除时间：${until}${ban.reason ? `\n原因：${ban.reason}` : ''}`);
      return;
    }

    await registerKnownUser(
      ctx.env,
      ctx.from.id,
      ctx.chat.id,
      ctx.from.username,
      ctx.from.first_name
    );

    const fileId = ctx.message?.voice?.file_id ?? ctx.message?.audio?.file_id;
    if (!fileId) return;

    const statusMsg = await ctx.reply('· 正在转换语音…', {
      reply_parameters: { message_id: ctx.message!.message_id }
    });

    let statusActive = true;
    let statusFrame = 0;
    const DOT_FRAMES = ['', '.', '..', '...'];
    const statusInterval = setInterval(() => {
      if (!statusActive) return;
      statusFrame = (statusFrame + 1) % DOT_FRAMES.length;
      ctx.api
        .editMessageText(ctx.chat!.id, statusMsg.message_id, `· 正在转换语音${DOT_FRAMES[statusFrame]}`)
        .catch(() => {});
    }, 900);

    try {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) {
        statusActive = false;
        clearInterval(statusInterval);
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '抱歉，无法获取这条语音消息，请重试。');
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.file_path}`;
      const transcription = await transcribeAudio(ctx.env, fileUrl);

      statusActive = false;
      clearInterval(statusInterval);

      if (!transcription.ok || !transcription.text) {
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          '抱歉，语音识别失败了，请再试一次，或者换成文字发送。'
        );
        return;
      }

      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `· 识别结果：${transcription.text}`
      );

      const durationSeconds = ctx.message?.voice?.duration ?? ctx.message?.audio?.duration ?? 0;
      if (durationSeconds > 0) {
        await recordNeuronUsage(ctx.env, (durationSeconds / 60) * WHISPER_NEURONS_PER_MINUTE, 'audio');
      }

      await runAiTurn(ctx, ctx.chat.id, ctx.from.id, transcription.text, ctx.message!.message_id);
    } catch (err) {
      console.error('Voice handling failed:', err);
      statusActive = false;
      clearInterval(statusInterval);
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '抱歉，处理语音消息时出错了，请稍后再试。').catch(() => {});
    }
  });
}
