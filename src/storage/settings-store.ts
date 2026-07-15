import type { Env } from '../types/env';

export interface SettingsOverride {
  AI_MODEL?: string;
  SYSTEM_PROMPT?: string;
  MAX_HISTORY?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  GROUP_MENTION_REQUIRED?: string;
  BOT_USERNAME?: string;
  ADMIN_USER_IDS?: string;
  ALLOWED_USER_IDS?: string;
}

export type SettingsKey = keyof SettingsOverride;

export interface SettingMeta {
  key: SettingsKey;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'number' | 'boolean';
  sensitive?: boolean;
  placeholder?: string;
}

export const SETTINGS_META: SettingMeta[] = [
  {
    key: 'AI_MODEL',
    label: '默认 AI 模型',
    description: '用户没有自选模型时使用的默认模型 ID，例如 @cf/meta/llama-3.1-8b-instruct',
    type: 'text',
    placeholder: '@cf/meta/llama-3.1-8b-instruct'
  },
  {
    key: 'SYSTEM_PROMPT',
    label: '默认系统提示词',
    description: '用户没有选择任何风格时使用的默认系统提示词（一般不需要改，风格已经在 /settings 里管理）',
    type: 'textarea'
  },
  {
    key: 'MAX_HISTORY',
    label: '最大历史消息数',
    description: '每个对话保留多少条消息作为上下文，超出会自动裁剪最旧的',
    type: 'number',
    placeholder: '8'
  },
  {
    key: 'RATE_LIMIT_PER_MINUTE',
    label: '每分钟限流次数',
    description: '每个聊天每分钟最多可以发送多少次请求',
    type: 'number',
    placeholder: '12'
  },
  {
    key: 'GROUP_MENTION_REQUIRED',
    label: '群聊需要@才回复',
    description: '开启后，机器人在群聊里只有被@或回复它的消息才会响应',
    type: 'boolean'
  },
  {
    key: 'BOT_USERNAME',
    label: '机器人用户名',
    description: '不带@符号，例如 my_ai_bot，用于识别群聊里的@提及与回复规则',
    type: 'text',
    placeholder: 'my_ai_bot'
  },
  {
    key: 'ADMIN_USER_IDS',
    label: '管理员用户 ID',
    description: '逗号分隔的 Telegram 用户 ID 列表，拥有 /stats /broadcast /ban 等管理员命令权限',
    type: 'text',
    placeholder: '123456789,987654321'
  },
  {
    key: 'ALLOWED_USER_IDS',
    label: '允许使用的用户 ID（暂未强制生效）',
    description: '逗号分隔的用户 ID 白名单，留空或填 all 表示所有人都可以使用',
    type: 'text',
    placeholder: 'all'
  }
];

const SETTINGS_KEY = 'admin:settings';

export async function getSettingsOverride(env: Env): Promise<SettingsOverride> {
  const raw = await env.BOT_KV.get(SETTINGS_KEY, 'json');
  return (raw as SettingsOverride | null) ?? {};
}

export async function updateSettingsOverride(env: Env, patch: SettingsOverride): Promise<SettingsOverride> {
  const existing = await getSettingsOverride(env);
  const next: SettingsOverride = { ...existing };

  for (const meta of SETTINGS_META) {
    if (!(meta.key in patch)) continue;
    const value = patch[meta.key];
    if (value === undefined || value === '') {
      delete next[meta.key];
    } else {
      next[meta.key] = value;
    }
  }

  await env.BOT_KV.put(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function resetSettingOverride(env: Env, key: SettingsKey): Promise<SettingsOverride> {
  const existing = await getSettingsOverride(env);
  delete existing[key];
  await env.BOT_KV.put(SETTINGS_KEY, JSON.stringify(existing));
  return existing;
}

export async function resolveEnv(env: Env): Promise<Env> {
  const override = await getSettingsOverride(env);
  return { ...env, ...override } as Env;
}
