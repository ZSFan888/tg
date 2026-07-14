import type { BotContext } from '../bot/context';

const GROUP_TYPES = new Set(['group', 'supergroup']);

export function isGroupChatType(ctx: BotContext): boolean {
  return Boolean(ctx.chat && GROUP_TYPES.has(ctx.chat.type));
}

export function shouldReplyInGroup(ctx: BotContext): boolean {
  if (!isGroupChatType(ctx)) return true;
  if (ctx.env.GROUP_MENTION_REQUIRED !== 'true') return true;

  const text = ctx.message?.text ?? '';
  const username = (ctx.env.BOT_USERNAME || '').replace(/^@/, '');
  const mentioned = username ? text.includes(`@${username}`) : false;
  const repliedToBot = Boolean(
    ctx.message?.reply_to_message?.from?.is_bot &&
    username &&
    ctx.message.reply_to_message.from.username === username
  );

  return mentioned || repliedToBot;
}

export function stripBotMention(text: string, username?: string): string {
  const cleanUsername = (username || '').replace(/^@/, '');
  if (!cleanUsername) return text.trim();
  return text.replaceAll(`@${cleanUsername}`, '').trim();
}
