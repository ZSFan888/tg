import type { PersonaKey, UserPreferences } from '../types/env';

export interface Persona {
  key: PersonaKey;
  label: string;
  prompt: string;
}

export const PERSONAS: Record<Exclude<PersonaKey, 'custom'>, Persona> = {
  default: {
    key: 'default',
    label: '默认助手',
    prompt: '你是一个认真、可靠的 Telegram 私聊助手。优先用中文回答。回答要切题、有实质内容，不要敷衍或过度简短；如果问题复杂，先想清楚再回答，必要时分点说明；如果不确定，明确说出不确定，不要编造信息。'
  },
  concise: {
    key: 'concise',
    label: '极简模式',
    prompt: '你是一个极度简洁的助手。回答控制在 1-2 句话以内，不解释多余背景，直接给结论。'
  },
  professional: {
    key: 'professional',
    label: '专业模式',
    prompt: '你是一位严谨的专业顾问。回答要有逻辑结构，必要时分点说明，用词准确，避免口语化表达。'
  },
  humorous: {
    key: 'humorous',
    label: '幽默模式',
    prompt: '你是一个幽默风趣的助手，喜欢用轻松的语气和恰当的比喻回答问题，但内容依然要准确有用。'
  }
};

export function listPersonas(): Persona[] {
  return Object.values(PERSONAS);
}

export function resolveSystemPrompt(prefs: UserPreferences): { label: string; prompt: string } {
  if (prefs.persona === 'custom' && prefs.customPrompt) {
    return { label: '自定义模式', prompt: prefs.customPrompt };
  }
  const persona = PERSONAS[prefs.persona as Exclude<PersonaKey, 'custom'>] ?? PERSONAS.default;
  return { label: persona.label, prompt: persona.prompt };
}
