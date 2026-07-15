export interface Env {
  BOT_TOKEN: string;
  // Cloudflare Pages 在运行时自动注入的部署元信息，用于查看当前版本对应的 git commit。
  CF_PAGES_COMMIT_SHA?: string;
  CF_PAGES_BRANCH?: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BOT_WEBHOOK_PATH: string;
  ALLOWED_USER_IDS?: string;
  ADMIN_USER_IDS?: string;
  AI_MODEL: string;
  SYSTEM_PROMPT: string;
  MAX_HISTORY?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  BOT_KV: KVNamespace;
  AI: Ai;
  GROUP_MENTION_REQUIRED?: string;
  BOT_USERNAME?: string;
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

export type PersonaKey = 'default' | 'concise' | 'professional' | 'humorous' | 'custom';

export type ModelTask = 'chat' | 'speech_to_text' | 'text_to_speech' | 'image' | 'vision' | 'translation' | 'embedding' | 'rerank' | 'classification';

export interface UserPreferences {
  persona: PersonaKey;
  customPrompt?: string;
  modelId?: string;
  activeTask?: ModelTask;
  voiceReplyEnabled?: boolean;
  voiceModeEnabled?: boolean;
  autoTaskRouting?: boolean;
  updatedAt: number;
}

export interface UsageState {
  date: string;
  count: number;
}

export interface KnownUser {
  userId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface GlobalDailyStats {
  date: string;
  messageCount: number;
}

export interface DailyStatPoint {
  date: string;
  messageCount: number;
}

export interface BanRecord {
  userId: number;
  bannedAt: number;
  until?: number;
  reason?: string;
}

export type PendingAction = 'awaiting_custom_prompt' | 'awaiting_image_prompt' | 'awaiting_image_edit_prompt';

export interface PendingState {
  action: PendingAction;
  createdAt: number;
  fileId?: string;
  mimeType?: string;
}
