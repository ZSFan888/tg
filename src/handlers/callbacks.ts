import { InlineKeyboard, InputFile } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import type { ModelTask, PersonaKey } from '../types/env';
import { clearChatHistory, getChatHistory } from '../storage/chat-store';
import { getUserPreferences, setUserPersona, setUserModel, setVoiceReplyEnabled, setVoiceModeEnabled } from '../storage/preferences-store';
import { setPendingAction } from '../storage/pending-store';
import { getUsage } from '../storage/usage-store';
import { listPersonas, resolveSystemPrompt } from '../config/personas';
import { MODELS, PROVIDERS, TASKS, getModelById, getModelByKey, getModelsByProvider, getModelsByTask, getProviderByKey, getTaskByKey } from '../config/models';
import { getFollowUps } from '../storage/followup-store';
import { runAiTurn, runImageTurn } from './messages';
import { isAdmin } from '../utils/access';
import { getAllKnownUsers } from '../storage/users-store';
import { getGlobalStats, getStatsHistory, getModelStats } from '../storage/usage-store';
import { buildUsageChartUrl } from '../services/chart';
import {
  getTodayNeuronUsage,
  getNeuronUsageHistory,
  projectDepletionHour,
  DAILY_FREE_NEURONS_CONST
} from '../storage/neurons-store';

export function registerCallbacks(bot: Bot<BotContext>) {
  bot.callbackQuery('menu:chat', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('可以开始了，直接发送你的问题。');
  });

  bot.callbackQuery('menu:model', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard();
    for (const task of TASKS) {
      const count = getModelsByTask(task.key).length;
      keyboard.text(`${task.label}（${count}）`, `modeltask:${task.key}`).row();
    }

    await ctx.reply('先选择模型任务类型：', { reply_markup: keyboard });
  });

  bot.callbackQuery(/^modeltask:(.+)$/, async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const taskKey = ctx.match[1] as ModelTask;
    const task = getTaskByKey(taskKey);
    if (!task) return;

    const models = getModelsByTask(taskKey);
    const keyboard = new InlineKeyboard();
    for (const [index, model] of models.entries()) {
      const prefix = index === 0 ? '★ ' : `${index + 1}. `;
      keyboard.text(`${prefix}${model.label}`, `model:${model.key}`).row();
    }
    keyboard.text('« 返回任务类型', 'menu:model');

    await ctx.reply(`${task.label}模型：

选择一个模型：`, { reply_markup: keyboard });
  });

  bot.callbackQuery('menu:image', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();
    await setPendingAction(ctx.env, ctx.from.id, 'awaiting_image_prompt');
    await ctx.reply('请告诉我你想生成什么图。\n如果你是想重绘现有图片，也可以直接先发一张图给我，然后再描述你想怎么改。');
  });

  bot.callbackQuery('menu:voice', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const enabled = Boolean(prefs.voiceReplyEnabled);
    const keyboard = new InlineKeyboard()
      .text(enabled ? '关闭语音回复' : '开启语音回复', `voice:${enabled ? 'off' : 'on'}`);

    await ctx.reply(
      enabled
        ? '语音回复：已开启\n之后我在文字回答后，会额外发一条语音。'
        : '语音回复：已关闭\n开启后，我会在文字回答后额外发一条语音。',
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery('menu:voicemode', async (ctx) => {
    if (!ctx.from) return;
    await ctx.answerCallbackQuery();

    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const enabled = Boolean(prefs.voiceModeEnabled);
    const keyboard = new InlineKeyboard()
      .text(enabled ? '关闭语音模式' : '开启语音模式', `voicemode:${enabled ? 'off' : 'on'}`);

    await ctx.reply(
      enabled
        ? '语音模式：已开启\n你发语音时，我会优先直接回语音，更像语音助手。'
        : '语音模式：已关闭\n开启后，你发语音给我时，我会优先回语音。',
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery('menu:export', async (ctx) => {
    if (!ctx.chat) return;
    await ctx.answerCallbackQuery();

    const history = await getChatHistory(ctx.env, ctx.chat.id);
    if (history.length === 0) {
      await ctx.reply('当前没有可导出的对话记录。');
      return;
    }

    const lines = history.map((msg) => {
      const speaker = msg.role === 'user' ? '我' : 'AI';
      return `[${speaker}] ${msg.content}`;
    });

    const text = lines.join('\n\n');
    const bytes = new TextEncoder().encode(text);
    const filename = `chat-export-${new Date().toISOString().slice(0, 10)}.txt`;

    await ctx.replyWithDocument(new InputFile(bytes, filename), {
      caption: `对话记录导出，共 ${history.length} 条消息。`
    });
  });

  bot.callbackQuery('menu:myid', async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    await ctx.answerCallbackQuery();

    const lines = [
      '» 你的账号信息',
      '',
      `用户 ID：${ctx.from.id}`,
      `用户名：${ctx.from.username ? '@' + ctx.from.username : '（未设置）'}`,
      `昵称：${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`,
      `会话 ID（chat id）：${ctx.chat.id}`
    ];

    await ctx.reply(lines.join('\n'));
  });

  bot.callbackQuery('menu:ping', async (ctx) => {
    await ctx.answerCallbackQuery();
    const started = Date.now();
    const msg = await ctx.reply('检测中…');
    const latency = Date.now() - started;
    await ctx.api.editMessageText(
      msg.chat.id,
      msg.message_id,
      `· 系统状态：正常\n· 响应延迟：约 ${latency}ms`
    );
  });

  bot.callbackQuery('menu:version', async (ctx) => {
    await ctx.answerCallbackQuery();
    const sha = ctx.env.CF_PAGES_COMMIT_SHA;
    const branch = ctx.env.CF_PAGES_BRANCH;
    const shortSha = sha ? sha.slice(0, 7) : '未知（本地/未部署）';
    const lines = [
      `· 当前版本（git commit）：${shortSha}`,
      branch ? `· 分支：${branch}` : undefined,
      sha ? `https://github.com/ZSFan888/tg/commit/${sha}` : undefined
    ].filter((line): line is string => Boolean(line));
    await ctx.reply(lines.join('\n'));
  });

  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.answerCallbackQuery();

    const lines = [
      '可用功能：',
      '· 直接发消息即可聊天',
      '· 偏好设置 - 切换回复风格/自定义提示词',
      '· 切换模型 - 选择不同能力/速度的 AI 模型',
      '· AI 生图 - 支持直接文生图，也支持先发图再描述修改需求',
      '· 清空上下文 - 重置当前会话记忆',
      '· 使用统计 - 查看今日使用次数和限流',
      '· 导出记录 - 把当前对话保存为文本文件',
      '· 我的 ID - 查看你的 Telegram 用户 ID / 会话 ID',
      '· 系统状态 - 检测机器人是否在线及响应延迟',
      '',
      '也可以直接发送语音消息；开启语音模式后，我会优先回语音。'
    ];

    if (ctx.from && isAdmin(ctx.env, ctx.from.id)) {
      lines.push(
        '',
        '管理员功能（以下仍需直接输入命令）：',
        '/stats - 查看全局使用统计',
        '/neurons - 查看今日 Neurons 用量预估',
        '/broadcast <内容> - 群发通知给所有已知用户',
        '/ban <用户ID> [分钟数] [原因] - 禁用用户',
        '/unban <用户ID> - 解除禁用'
      );
    }

    await ctx.reply(lines.join('\n'));
  });

  bot.callbackQuery('menu:admin', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.env, ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: '仅管理员可用' });
      return;
    }
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .text('全局统计', 'menu:stats')
      .text('Neurons 用量', 'menu:neurons');

    await ctx.reply(
      '管理员选项：\n· 全局统计 / Neurons 用量可直接点按钮查看\n· 群发、禁用、解禁用户仍需手动输入命令：\n  /broadcast <内容>\n  /ban <用户ID> [分钟数] [原因]\n  /unban <用户ID>',
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery('menu:stats', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.env, ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: '仅管理员可用' });
      return;
    }
    await ctx.answerCallbackQuery();

    const [users, global, history, modelStats] = await Promise.all([
      getAllKnownUsers(ctx.env),
      getGlobalStats(ctx.env),
      getStatsHistory(ctx.env),
      getModelStats(ctx.env)
    ]);

    const now = Date.now();
    const activeToday = users.filter((u) => now - u.lastSeenAt < 24 * 60 * 60 * 1000).length;
    const activeWeek = users.filter((u) => now - u.lastSeenAt < 7 * 24 * 60 * 60 * 1000).length;

    const modelLines = MODELS
      .map((m) => ({ label: m.label, count: modelStats[m.id] ?? 0 }))
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((m) => `  ${m.label}：${m.count} 次`);

    const summary = [
      '» 全局使用统计',
      '',
      `累计用户数：${users.length}`,
      `今日活跃用户：${activeToday}`,
      `近 7 天活跃用户：${activeWeek}`,
      `今日消息总数：${global.messageCount}`,
      '',
      '按模型调用次数（累计）：',
      ...(modelLines.length > 0 ? modelLines : ['  暂无调用记录'])
    ].join('\n');

    if (history.length === 0) {
      await ctx.reply(summary);
      return;
    }

    try {
      const chartUrl = buildUsageChartUrl(history);
      await ctx.replyWithPhoto(chartUrl, { caption: summary });
    } catch (err) {
      console.error('Failed to render usage chart:', err);
      await ctx.reply(summary);
    }
  });

  bot.callbackQuery('menu:neurons', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.env, ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: '仅管理员可用' });
      return;
    }
    await ctx.answerCallbackQuery();

    const [today, history] = await Promise.all([
      getTodayNeuronUsage(ctx.env),
      getNeuronUsageHistory(ctx.env, 7)
    ]);

    const used = Math.round(today.total);
    const percent = Math.min(100, Math.round((used / DAILY_FREE_NEURONS_CONST) * 100));
    const remaining = Math.max(0, DAILY_FREE_NEURONS_CONST - used);

    const barLength = 20;
    const filled = Math.round((percent / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    const projection = projectDepletionHour(used);

    const lines = [
      '» 今日 Neurons 使用预估',
      '',
      `${bar} ${percent}%`,
      `已用：约 ${used} / ${DAILY_FREE_NEURONS_CONST}（免费额度）`,
      `剩余：约 ${remaining}`,
      `今日调用：文字 ${today.chatCalls} 次，语音 ${today.audioCalls} 次`,
      ''
    ];

    if (projection.willExhaustToday && projection.estimatedExhaustionHourUtc !== null) {
      const hour = Math.floor(projection.estimatedExhaustionHourUtc);
      const minute = Math.round((projection.estimatedExhaustionHourUtc - hour) * 60);
      lines.push(`⚠ 按当前速度预计将在 UTC ${hour}:${String(minute).padStart(2, '0')} 左右用完今日免费额度`);
    } else if (percent >= 80) {
      lines.push('⚠ 今日额度消耗已超过 80%，请注意使用频率');
    } else {
      lines.push('· 按当前速度，今日额度预计够用');
    }

    lines.push('', '注：此数据为估算值，基于各模型官方 Token 单价换算，可能与 Cloudflare 后台精确计费略有差异。');

    if (history.filter((h) => h.total > 0).length >= 2) {
      const historyLines = history
        .filter((h) => h.total > 0)
        .map((h) => `  ${h.date}：约 ${Math.round(h.total)} neurons`);
      lines.push('', '近期每日消耗：', ...historyLines);
    }

    await ctx.reply(lines.join('\n'));
  });

  bot.callbackQuery('menu:clear', async (ctx) => {
    if (!ctx.chat) return;
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
      const label = persona.key === prefs.persona ? `» ${persona.label}` : persona.label;
      keyboard.text(label, `persona:${persona.key}`).row();
    }
    keyboard.text(
      prefs.persona === 'custom' ? '» 自定义模式' : '自定义模式（输入你自己的提示词）',
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

  bot.callbackQuery(/^model:(.+)$/, async (ctx) => {
    if (!ctx.from) return;
    const modelKey = ctx.match?.[1] ?? '';
    const model = getModelByKey(modelKey);

    await setUserModel(ctx.env, ctx.from.id, model.id);

    await ctx.answerCallbackQuery({ text: `已切换到${model.label}` });
    await ctx.editMessageText(`模型已切换为：${model.label}\n${model.note}`);
  });

  bot.callbackQuery(/^voicemode:(on|off)$/, async (ctx) => {
    if (!ctx.from) return;
    const nextState = ctx.match?.[1] === 'on';

    await setVoiceModeEnabled(ctx.env, ctx.from.id, nextState);

    await ctx.answerCallbackQuery({ text: nextState ? '语音模式已开启' : '语音模式已关闭' });
    await ctx.editMessageText(
      nextState
        ? '语音模式：已开启\n你发语音给我时，我会优先直接回语音。'
        : '语音模式：已关闭\n恢复为常规文字聊天逻辑。'
    );
  });

  bot.callbackQuery(/^voice:(on|off)$/, async (ctx) => {
    if (!ctx.from) return;
    const nextState = ctx.match?.[1] === 'on';

    await setVoiceReplyEnabled(ctx.env, ctx.from.id, nextState);

    await ctx.answerCallbackQuery({ text: nextState ? '语音回复已开启' : '语音回复已关闭' });
    await ctx.editMessageText(
      nextState
        ? '语音回复：已开启\n之后我会在文字回答后额外发一条语音。'
        : '语音回复：已关闭\n恢复为只输出文字回答。'
    );
  });

  bot.callbackQuery('regen:last', async (ctx) => {
    if (!ctx.from || !ctx.chat) return;

    const history = await getChatHistory(ctx.env, ctx.chat.id);
    const lastUserIndex = history.map((m) => m.role).lastIndexOf('user');

    if (lastUserIndex === -1) {
      await ctx.answerCallbackQuery({ text: '没有可重新生成的消息' });
      return;
    }

    const lastUserMsg = history[lastUserIndex];
    const historyWithoutLastTurn = history.slice(0, lastUserIndex);

    await ctx.answerCallbackQuery({ text: '正在重新生成…' });

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      // ignore
    }

    await runAiTurn(
      ctx,
      ctx.chat.id,
      ctx.from.id,
      lastUserMsg.content,
      undefined,
      { historyOverride: historyWithoutLastTurn, isRegenerate: true }
    );
  });

  bot.callbackQuery('noop', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '追问生成中，请稍候…' });
  });

  bot.callbackQuery(/^followup:(\d+):(\d+)$/, async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const messageId = Number(ctx.match?.[1]);
    const index = Number(ctx.match?.[2]);

    const questions = await getFollowUps(ctx.env, ctx.chat.id, messageId);
    const question = questions[index];

    if (!question) {
      await ctx.answerCallbackQuery({ text: '这个追问已经失效了' });
      return;
    }

    await ctx.answerCallbackQuery();

    // 先把追问的问题当作一条“用户发出的消息”发出来，
    // 而不是直接把答案怼出来，这样看起来跟自己手动打字问的一样，
    // 也方便回头翻聊天记录时能看清问的是什么。
    const questionMsg = await ctx.api.sendMessage(ctx.chat.id, question);

    await runAiTurn(ctx, ctx.chat.id, ctx.from.id, question, questionMsg.message_id);
  });
}
