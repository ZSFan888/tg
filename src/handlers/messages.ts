import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { generateReplyStream, optimizeImagePrompt } from '../services/ai';
import { generateFollowUps } from '../services/followups';
import { getChatHistory, saveChatHistory } from '../storage/chat-store';
import { checkRateLimit } from '../storage/rate-limit';
import { getUserPreferences } from '../storage/preferences-store';
import { getPendingAction, clearPendingAction, setPendingAction } from '../storage/pending-store';
import { setCustomPrompt } from '../storage/preferences-store';
import { incrementUsage, incrementGlobalStats, incrementModelUsage } from '../storage/usage-store';
import { registerKnownUser } from '../storage/users-store';
import { saveFollowUps } from '../storage/followup-store';
import { getBanRecord } from '../storage/ban-store';
import { sanitizeMarkdown } from '../utils/markdown';
import { transcribeAudio } from '../services/transcribe';
import { synthesizeSpeech } from '../services/tts';
import { generateImage, editImage } from '../services/image';
import { resolveSystemPrompt } from '../config/personas';
import { recordNeuronUsage, estimateChatNeurons, WHISPER_NEURONS_PER_MINUTE } from '../storage/neurons-store';
import { recordActivityAndCount, shouldAlertAndMark } from '../storage/anomaly-store';
import { parseCsvNumbers } from '../utils/access';
import type { ChatMessage } from '../types/env';
import { InputFile } from 'grammy';

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
  suppressVoiceReply?: boolean;
  voiceFirstReply?: boolean;
  noFollowUps?: boolean;
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
  const { prompt: resolvedBasePrompt } = resolveSystemPrompt(prefs);
  const basePrompt = options.voiceFirstReply
    ? `${resolvedBasePrompt}\n\n当前是语音模式。请使用简短、自然、口语化、适合直接朗读的中文回答。优先 1 到 3 句，总长度尽量控制在 80 个中文字符以内，不要使用复杂列表，不要写长段落，不要加标题。`
    : resolvedBasePrompt;
  const history = historyFromStore;
  const modelId = prefs.modelId ?? ctx.env.AI_MODEL;

  const placeholderBase = options.editedNotice
    ? '· 检测到消息已编辑，重新生成回答'
    : '思考中';

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

  const prompt = basePrompt;

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

  if (!options.suppressVoiceReply) {
    ctx.waitUntil(maybeSendVoiceReply(ctx, chatId, userId, placeholder.message_id, cleanFinalText));
  }

  if (!options.noFollowUps) ctx.waitUntil(
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


function extractFinalAnswer(text: string): string {
  const clean = sanitizeMarkdown(text).trim();
  const markers = ['语音摘要：', '· 识别结果：'];
  let result = clean;
  for (const marker of markers) {
    if (result.startsWith(marker)) {
      result = result.slice(marker.length).trim();
    }
  }
  return result
    .replace(/^好的[，,]\s*/u, '')
    .replace(/^下面[是为：:：].*$/gmu, '')
    .trim();
}

async function maybeSendVoiceReply(ctx: BotContext, chatId: number, userId: number, replyToMessageId: number | undefined, text: string) {
  const prefs = await getUserPreferences(ctx.env, userId);
  if (!prefs.voiceReplyEnabled) return;

  const speech = await synthesizeSpeech(ctx.env, text);
  if (!speech.ok || !speech.audioBytes) return;

  await ctx.api.sendVoice(chatId, new InputFile(speech.audioBytes, 'reply.ogg'), replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined).catch(async () => {
    await ctx.reply(extractFinalAnswer(text), replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined).catch(() => {});
  });
}

async function runVoiceModeTurn(
  ctx: BotContext,
  chatId: number,
  userId: number,
  text: string,
  replyToMessageId: number | undefined
) {
  const summaryPlaceholder = await ctx.reply('· 正在准备语音回复…', replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined);

  const [prefs, historyFromStore] = await Promise.all([
    getUserPreferences(ctx.env, userId),
    getChatHistory(ctx.env, chatId)
  ]);
  const { prompt: resolvedBasePrompt } = resolveSystemPrompt(prefs);
  const voicePrompt = `${resolvedBasePrompt}

当前是语音模式。请使用简短、自然、口语化、适合直接朗读的中文回答。优先 1 到 3 句，总长度尽量控制在 80 个中文字符以内，不要使用复杂列表，不要写长段落，不要加标题。直接回答用户问题，不要展示你的思考过程，不要分析需求，不要分步骤解释。`;

  const { text: finalTextRaw, usage } = await generateReplyStream(ctx.env, historyFromStore, text, voicePrompt, {
    onChunk: async () => {},
    onDone: async () => {},
    onError: async () => {}
  }, prefs.modelId ?? ctx.env.AI_MODEL);

  const finalText = extractFinalAnswer(finalTextRaw);
  if (!finalText) {
    await ctx.api.editMessageText(chatId, summaryPlaceholder.message_id, '抱歉，这次没有成功生成语音回复，请再试一次。').catch(() => {});
    return;
  }

  await Promise.all([
    saveChatHistory(ctx.env, chatId, [
      ...historyFromStore,
      { role: 'user', content: text },
      { role: 'assistant', content: finalText }
    ]),
    incrementUsage(ctx.env, userId),
    incrementGlobalStats(ctx.env),
    incrementModelUsage(ctx.env, prefs.modelId ?? ctx.env.AI_MODEL),
    recordNeuronUsage(ctx.env, estimateChatNeurons(prefs.modelId ?? ctx.env.AI_MODEL, usage.promptTokens, usage.completionTokens), 'chat')
  ]);

  const speech = await synthesizeSpeech(ctx.env, finalText);
  if (!speech.ok || !speech.audioBytes) {
    await ctx.api.editMessageText(chatId, summaryPlaceholder.message_id, finalText).catch(() => {});
    return;
  }

  const sent = await ctx.api.sendVoice(
    chatId,
    new InputFile(speech.audioBytes, 'voice-mode.ogg'),
    replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined
  ).then(() => true).catch(() => false);

  if (!sent) {
    await ctx.api.editMessageText(chatId, summaryPlaceholder.message_id, finalText).catch(() => {});
    return;
  }

  await ctx.api.deleteMessage(chatId, summaryPlaceholder.message_id).catch(async () => {
    await ctx.api.editMessageText(chatId, summaryPlaceholder.message_id, '· 语音回复已发送').catch(() => {});
  });
}

async function downloadTelegramFile(ctx: BotContext, fileId: string) {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) return null;
  const fileUrl = `https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get('content-type') ?? 'image/jpeg' };
}

export async function runImageTurn(
  ctx: BotContext,
  chatId: number,
  userId: number,
  prompt: string,
  replyToMessageId: number | undefined
) {
  const rate = await checkRateLimit(ctx.env, chatId);
  if (!rate.ok) {
    await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
    return;
  }

  const placeholder = await ctx.api.sendMessage(chatId, '· 正在优化提示词并生成图片…', replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined);
  const optimized = await optimizeImagePrompt(ctx.env, prompt);
  const image = await generateImage(ctx.env, optimized.optimizedPrompt);

  if (!image.ok || !image.imageBytes) {
    const reason = image.errorMessage ? `\n原因：${image.errorMessage}` : '';
    await ctx.api.editMessageText(chatId, placeholder.message_id, `抱歉，图片生成失败了，请换个描述再试。${reason}`).catch(() => {});
    return;
  }

  await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => {});
  await ctx.api.sendPhoto(chatId, new InputFile(image.imageBytes, 'ai-image.jpg'), {
    caption: `AI 生图提示词：${optimized.optimizedPrompt.slice(0, 900)}${optimized.briefTip ? `\n提示词优化：${optimized.briefTip}` : ''}`,
    ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {})
  }).catch(async () => {
    await ctx.reply('图片已经生成，但发送失败了，请稍后再试。');
  });
}

export async function runImageEditTurn(
  ctx: BotContext,
  chatId: number,
  userId: number,
  prompt: string,
  sourceFileId: string,
  replyToMessageId: number | undefined
) {
  const rate = await checkRateLimit(ctx.env, chatId);
  if (!rate.ok) {
    await ctx.reply(`请求太频繁了，请稍后再试。限制：每分钟 ${rate.limit} 次。`);
    return;
  }

  const placeholder = await ctx.api.sendMessage(chatId, '· 正在优化重绘需求并生成图片…', replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : undefined);
  const optimized = await optimizeImagePrompt(ctx.env, prompt);
  const source = await downloadTelegramFile(ctx, sourceFileId);
  if (!source) {
    await ctx.api.editMessageText(chatId, placeholder.message_id, '抱歉，无法读取原图，请重新发送图片再试。').catch(() => {});
    return;
  }

  const image = await editImage(ctx.env, optimized.optimizedPrompt, source);
  if (!image.ok || !image.imageBytes) {
    const reason = image.errorMessage ? `\n原因：${image.errorMessage}` : '';
    await ctx.api.editMessageText(chatId, placeholder.message_id, `抱歉，图片重绘失败了，请换个修改要求再试。${reason}`).catch(() => {});
    return;
  }

  await ctx.api.deleteMessage(chatId, placeholder.message_id).catch(() => {});
  await ctx.api.sendPhoto(chatId, new InputFile(image.imageBytes, 'ai-redraw.jpg'), {
    caption: `图片重绘需求：${optimized.optimizedPrompt.slice(0, 900)}${optimized.briefTip ? `\n提示词优化：${optimized.briefTip}` : ''}`,
    ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {})
  }).catch(async () => {
    await ctx.reply('图片已经重绘完成，但发送失败了，请稍后再试。');
  });
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

      if (pending?.action === 'awaiting_image_prompt') {
        await clearPendingAction(ctx.env, ctx.from.id);
        const questionMsg = await ctx.reply(`已收到你的生图需求：${text}`);
        await runImageTurn(ctx, ctx.chat.id, ctx.from.id, text, questionMsg.message_id);
        return;
      }

      if (pending?.action === 'awaiting_image_edit_prompt' && pending.fileId) {
        await clearPendingAction(ctx.env, ctx.from.id);
        const questionMsg = await ctx.reply(`已收到你的重绘需求：${text}`);
        await runImageEditTurn(ctx, ctx.chat.id, ctx.from.id, text, pending.fileId, questionMsg.message_id);
        return;
      }
    }

    const messageId = ctx.message?.message_id ?? ctx.editedMessage?.message_id;

    await runAiTurn(ctx, ctx.chat.id, ctx.from.id, text, messageId, { editedNotice: isEdited });
  });

  bot.on('message:photo', async (ctx) => {
    if (!ctx.from || !ctx.chat) return;

    const ban = await getBanRecord(ctx.env, ctx.from.id);
    if (ban) {
      const until = ban.until ? new Date(ban.until).toLocaleString('zh-CN') : '永久';
      await ctx.reply(`你已被限制使用这个机器人。
解除时间：${until}${ban.reason ? `
原因：${ban.reason}` : ''}`);
      return;
    }

    await registerKnownUser(
      ctx.env,
      ctx.from.id,
      ctx.chat.id,
      ctx.from.username,
      ctx.from.first_name
    );

    const photos = ctx.message?.photo;
    const fileId = photos?.[photos.length - 1]?.file_id;
    if (!fileId) return;

    await setPendingAction(ctx.env, ctx.from.id, 'awaiting_image_edit_prompt', { fileId });
    await ctx.reply(`我已经收到这张图。\n现在告诉我你想怎么改，比如：把背景换成雪山、改成动漫风、保留人物换衣服。`, {
      reply_parameters: { message_id: ctx.message!.message_id }
    });
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

      const prefs = await getUserPreferences(ctx.env, ctx.from.id);
      if (prefs.voiceModeEnabled) {
        await runVoiceModeTurn(ctx, ctx.chat.id, ctx.from.id, transcription.text, ctx.message!.message_id);
      } else {
        await runAiTurn(ctx, ctx.chat.id, ctx.from.id, transcription.text, ctx.message!.message_id);
      }
    } catch (err) {
      console.error('Voice handling failed:', err);
      statusActive = false;
      clearInterval(statusInterval);
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, '抱歉，处理语音消息时出错了，请稍后再试。').catch(() => {});
    }
  });
}
