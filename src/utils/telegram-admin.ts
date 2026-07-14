import type { BotContext } from '../bot/context';
import { isGroupChatType } from './telegram';

export async function isChatAdmin(ctx: BotContext, userId: number): Promise<boolean> {
  if (!ctx.chat || !isGroupChatType(ctx)) return false;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, userId);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

export function getTargetUserId(ctx: BotContext): number | undefined {
  return ctx.message?.reply_to_message?.from?.id;
}

export function getTargetDisplayName(ctx: BotContext): string {
  const user = ctx.message?.reply_to_message?.from;
  if (!user) return '该用户';
  return user.username ? `@${user.username}` : user.first_name;
}

export function parseDurationSeconds(input?: string): number | undefined {
  if (!input) return undefined;
  const match = input.trim().match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return undefined;

  const value = Number(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 60;
  return value * multiplier;
}
