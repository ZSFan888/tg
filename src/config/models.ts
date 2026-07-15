export interface ModelOption {
  key: string;
  id: string;
  label: string;
  note: string;
  provider: string;
  maxTokens: number;
}

export interface ProviderGroup {
  key: string;
  label: string;
}

export const PROVIDERS: ProviderGroup[] = [
  { key: 'meta', label: 'Meta（Llama 系列）' }
];

export const MODELS: ModelOption[] = [
  {
    key: 'fast',
    id: '@cf/meta/llama-3.2-1b-instruct',
    label: 'Llama 3.2 1B（默认·最快）',
    note: '参数最小，响应最快，适合轻量日常对话',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'balanced',
    id: '@cf/meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B（均衡）',
    note: '在速度和效果之间更均衡，适合普通聊天',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'llama8b',
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    label: 'Llama 3.1 8B（较强）',
    note: '小模型里能力更强一些，适合稍复杂的问题',
    provider: 'meta',
    maxTokens: 8000
  }
];

const DEFAULT_MAX_TOKENS = 8000;

export function getModelById(id?: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function getModelByKey(key?: string): ModelOption {
  return MODELS.find((m) => m.key === key) ?? MODELS[0];
}

export function getModelsByProvider(providerKey: string): ModelOption[] {
  return MODELS.filter((m) => m.provider === providerKey);
}

export function getProviderByKey(key?: string): ProviderGroup | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

export function getMaxTokensForModel(id?: string): number {
  if (!id) return DEFAULT_MAX_TOKENS;
  const model = MODELS.find((m) => m.id === id);
  return model?.maxTokens ?? DEFAULT_MAX_TOKENS;
}
