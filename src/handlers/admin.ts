import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context';
import { isBotAdmin } from '../utils/access';
import { isGroupChatType } from '../utils/telegram';
import {
  getTargetDisplayName,
  getTargetUserId,
  isChatAdmin,
  parseDurationSeconds
} from '../utils/telegram-admin';
import { addWarning, getWarnCount, resetWarnings } from '../storage/warn-store';

function maxWarnings(env: BotContext['env']) {
  const value = Number(env.MAX_WARNINGS ?? '3');
  return Number.isFinite(value) && value > 0 ? value : 3;
}

async function requireGroupAdmin(ctx: BotContext): Promise<boolean> {
  if (!ctx.chat || !isGroupChatType(ctx)) {
    await ctx.reply('该命令只能在群组里使用。');
    return false;
  }

  const userId = ctx.from?.id;
  const authorized = isBotAdmin(ctx.env, userId) || (userId ? await isChatAdmin(ctx, userId) : false);

  if (!authorized) {
    await ctx.reply('只有群管理员或机器人管理员才能使用这个命令。');
    return false;
  }

  return true;
}

export function registerAdminCommands(bot: Bot<BotContext>) {
  bot.command('warn', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要警告的用户的消息，再发送 /warn。');
      return;
    }

    const count = await addWarning(ctx.env, ctx.chat.id, targetId);
    const limit = maxWarnings(ctx.env);
    const name = getTargetDisplayName(ctx);

    if (count >= limit) {
      try {
        await ctx.api.banChatMember(ctx.chat.id, targetId);
        await resetWarnings(ctx.env, ctx.chat.id, targetId);
        await ctx.reply(`${name} 已累计 ${count} 次警告，达到上限，已被移出群组。`);
      } catch {
        await ctx.reply(`${name} 已达到警告上限，但移出失败，请检查机器人权限。`);
      }
      return;
    }

    await ctx.reply(`${name} 已被警告，当前 ${count}/${limit} 次。`);
  });

  bot.command('unwarn', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要清除警告的用户的消息，再发送 /unwarn。');
      return;
    }

    await resetWarnings(ctx.env, ctx.chat.id, targetId);
    await ctx.reply(`${getTargetDisplayName(ctx)} 的警告记录已清空。`);
  });

  bot.command('warnings', async (ctx) => {
    const targetId = getTargetUserId(ctx) ?? ctx.from?.id;
    if (!targetId || !ctx.chat) return;

    const count = await getWarnCount(ctx.env, ctx.chat.id, targetId);
    const limit = maxWarnings(ctx.env);
    await ctx.reply(`当前警告次数：${count}/${limit}`);
  });

  bot.command('mute', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要禁言的用户的消息，再发送 /mute [时长，例如 10m / 2h / 1d]。');
      return;
    }

    const durationInput = ctx.match?.toString().trim();
    const durationSeconds = parseDurationSeconds(durationInput || '10m');
    const untilDate = durationSeconds
      ? Math.floor(Date.now() / 1000) + durationSeconds
      : undefined;

    try {
      await ctx.api.restrictChatMember(ctx.chat.id, targetId, {
        permissions: { can_send_messages: false },
        until_date: untilDate
      });
      const name = getTargetDisplayName(ctx);
      const label = durationInput || '10m';
      await ctx.reply(`${name} 已被禁言 ${label}。`);
    } catch {
      await ctx.reply('禁言失败，请确认机器人拥有管理员权限中的“限制成员”权限。');
    }
  });

  bot.command('unmute', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要解除禁言的用户的消息，再发送 /unmute。');
      return;
    }

    try {
      await ctx.api.restrictChatMember(ctx.chat.id, targetId, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        }
      });
      await ctx.reply(`${getTargetDisplayName(ctx)} 已解除禁言。`);
    } catch {
      await ctx.reply('解除禁言失败，请检查机器人权限。');
    }
  });

  bot.command('ban', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要移出的用户的消息，再发送 /ban。');
      return;
    }

    try {
      await ctx.api.banChatMember(ctx.chat.id, targetId);
      await resetWarnings(ctx.env, ctx.chat.id, targetId);
      await ctx.reply(`${getTargetDisplayName(ctx)} 已被移出群组。`);
    } catch {
      await ctx.reply('移出失败，请检查机器人权限。');
    }
  });

  bot.command('unban', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要解封的用户的消息，再发送 /unban。');
      return;
    }

    try {
      await ctx.api.unbanChatMember(ctx.chat.id, targetId, { only_if_banned: true });
      await ctx.reply(`${getTargetDisplayName(ctx)} 已解封，可以重新加入群组。`);
    } catch {
      await ctx.reply('解封失败，请检查机器人权限。');
    }
  });

  bot.command('kick', async (ctx) => {
    if (!(await requireGroupAdmin(ctx))) return;

    const targetId = getTargetUserId(ctx);
    if (!targetId || !ctx.chat) {
      await ctx.reply('请回复要踢出的用户的消息，再发送 /kick。');
      return;
    }

    try {
      await ctx.api.banChatMember(ctx.chat.id, targetId);
      await ctx.api.unbanChatMember(ctx.chat.id, targetId, { only_if_banned: true });
      await ctx.reply(`${getTargetDisplayName(ctx)} 已被踢出（可再次加入）。`);
    } catch {
      await ctx.reply('踢出失败，请检查机器人权限。');
    }
  });
}
