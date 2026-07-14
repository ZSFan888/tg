export interface Env {
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BOT_WEBHOOK_PATH: string;
  ALLOWED_USER_IDS?: string;
  AI_MODEL: string;
  SYSTEM_PROMPT: string;
  MAX_HISTORY?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  BOT_KV: KVNamespace;
  AI: Ai;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatState {
  messages: ChatMessage[];
  updatedAt: number;
}

export interface RateLimitState {
  count: number;
  resetAt: number;
}

export type PersonaKey = 'default' | 'concise' | 'professional' | 'humorous';

export interface UserPreferences {
  persona: PersonaKey;
  updatedAt: number;
}
