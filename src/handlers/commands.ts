import { InlineKeyboard, InputFile } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { clearChatHistory, getChatHistory } from '../storage/chat-store';
import { getUserPreferences, setWebSearchEnabled } from '../storage/preferences-store';
import { setPendingAction } from '../storage/pending-store';
import { getUsage } from '../storage/usage-store';
import { listPersonas, resolveSystemPrompt } from '../config/personas';
import { MODELS, getModelById } from '../config/models';
import { registerKnownUser } from '../storage/users-store';
import { isAdmin } from '../utils/access';
import { getAllKnownUsers } from '../storage/users-store';
import { getGlobalStats } from '../storage/usage-store';

export function registerCommands(bot: Bot<BotContext>) {
  bot.command('start', async (ctx) => {
    if (ctx.from) {
      await registerKnownUser(
        ctx.env,
        ctx.from.id,
        ctx.chat.id,
        ctx.from.username,
        ctx.from.first_name
      );
    }

    const keyboard = new InlineKeyboard()
      .text('开始聊天', 'menu:chat')
      .text('偏好设置', 'menu:settings')
      .row()
      .text('清空上下文', 'menu:clear')
      .text('使用统计', 'menu:usage');

    await ctx.reply(
      '你好，我已经在线。\n直接给我发消息就能聊天，也可以用下方按钮。',
      { reply_markup: keyboard }
    );
  });

  bot.command('help', async (ctx) => {
    const lines = [
      '可用命令：',
      '/start - 打开欢迎菜单',
      '/chat - 提示进入聊天模式',
      '/settings - 切换回复风格',
      '/setprompt - 设置自定义系统提示词',
      '/usage - 查看今日使用次数',
      '/clear - 清空当前会话上下文',
      '/export - 导出当前对话记录为文本文件',
      '/websearch - 开启/关闭联网搜索',
      '/model - 查看并切换 AI 模型',
      '/ping - 健康检查'
    ];

    if (ctx.from && isAdmin(ctx.env, ctx.from.id)) {
      lines.push('', '管理员专用：', '/stats - 查看全局使用统计', '/broadcast <内容> - 群发通知给所有已知用户');
    }

    await ctx.reply(lines.join('\n'));
  });

  bot.command('chat', async (ctx) => {
    await ctx.reply('进入聊天模式，直接发送你的问题即可。');
  });

  bot.command('settings', async (ctx) => {
    if (!ctx.from) return;
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

  bot.command('setprompt', async (ctx) => {
    if (!ctx.from) return;
    await setPendingAction(ctx.env, ctx.from.id, 'awaiting_custom_prompt');
    await ctx.reply('请发送你想要的系统提示词（描述这个 AI 应该扮演什么角色、用什么语气回答）。5 分钟内有效。');
  });

  bot.command('usage', async (ctx) => {
    if (!ctx.from) return;
    const usage = await getUsage(ctx.env, ctx.from.id);
    const limit = Number(ctx.env.RATE_LIMIT_PER_MINUTE ?? '12');
    await ctx.reply(`今日已使用：${usage.count} 次\n限流：每分钟最多 ${limit} 次`);
  });

  bot.command('model', async (ctx) => {
    if (!ctx.from) return;
    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const current = getModelById(prefs.modelId ?? ctx.env.AI_MODEL);

    const keyboard = new InlineKeyboard();
    for (const model of MODELS) {
      const label = model.id === current.id ? `» ${model.label}` : model.label;
      keyboard.text(label, `model:${model.key}`).row();
    }

    await ctx.reply(
      `当前模型：${current.label}\n${current.note}\n\n选择一个新的模型：`,
      { reply_markup: keyboard }
    );
  });

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  bot.command('clear', async (ctx) => {
    await clearChatHistory(ctx.env, ctx.chat.id);
    await ctx.reply('已清空当前会话上下文。');
  });

  bot.command('websearch', async (ctx) => {
    if (!ctx.from) return;
    const prefs = await getUserPreferences(ctx.env, ctx.from.id);
    const nextState = !prefs.webSearchEnabled;
    await setWebSearchEnabled(ctx.env, ctx.from.id, nextState);

    if (nextState && !ctx.env.TAVILY_API_KEY) {
      await ctx.reply('联网搜索已开启，但管理员还没有配置搜索服务的密钥，暂时无法生效。');
      return;
    }

    await ctx.reply(
      nextState
        ? '· 联网搜索已开启。之后每次提问，我会先搜索最新信息再回答。再发一次 /websearch 可以关闭。'
        : '· 联网搜索已关闭，回到只用模型自身知识回答。'
    );
  });

  bot.command('export', async (ctx) => {
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

  bot.command('stats', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.env, ctx.from.id)) {
      await ctx.reply('这个命令仅管理员可用。');
      return;
    }

    const [users, global] = await Promise.all([
      getAllKnownUsers(ctx.env),
      getGlobalStats(ctx.env)
    ]);

    const now = Date.now();
    const activeToday = users.filter((u) => now - u.lastSeenAt < 24 * 60 * 60 * 1000).length;
    const activeWeek = users.filter((u) => now - u.lastSeenAt < 7 * 24 * 60 * 60 * 1000).length;

    await ctx.reply([
      '» 全局使用统计',
      '',
      `累计用户数：${users.length}`,
      `今日活跃用户：${activeToday}`,
      `近 7 天活跃用户：${activeWeek}`,
      `今日消息总数：${global.messageCount}`
    ].join('\n'));
  });

  bot.command('broadcast', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.env, ctx.from.id)) {
      await ctx.reply('这个命令仅管理员可用。');
      return;
    }

    const content = ctx.match?.trim();
    if (!content) {
      await ctx.reply('用法：/broadcast 你要群发的内容\n例如：/broadcast 机器人今晚维护 30 分钟');
      return;
    }

    const users = await getAllKnownUsers(ctx.env);
    if (users.length === 0) {
      await ctx.reply('目前没有任何已知用户，无法群发。');
      return;
    }

    await ctx.reply(`开始群发，目标用户数：${users.length}，请稍候...`);

    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.chatId, `· 系统通知\n\n${content}`);
        success += 1;
      } catch {
        failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    await ctx.reply(`群发完成。成功：${success}，失败：${failed}`);
  });
}
