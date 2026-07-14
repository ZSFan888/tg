export interface ModelOption {
  key: string;
  id: string;
  label: string;
  note: string;
  provider: string;
  /**
   * Max tokens Workers AI is allowed to generate for this model. Cloudflare's
   * platform default is only 256 tokens (~300-400 Chinese characters), which
   * truncates any answer that runs long. We raise this per model based on its
   * published context window (leaving headroom for the input/history side of
   * that window), instead of a single global override that could exceed a
   * smaller model's window and cause request errors.
   */
  maxTokens: number;
}

export interface ProviderGroup {
  key: string;
  label: string;
}

export const PROVIDERS: ProviderGroup[] = [
  { key: 'meta', label: 'Meta（Llama 系列）' },
  { key: 'qwen', label: 'Qwen（阿里）' },
  { key: 'mistral', label: 'Mistral AI' },
  { key: 'google', label: 'Google（Gemma）' },
  { key: 'openai', label: 'OpenAI（开源版）' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'moonshot', label: 'Moonshot AI（Kimi）' },
  { key: 'zhipu', label: '智谱 AI（GLM）' },
  { key: 'nvidia', label: 'NVIDIA（Nemotron）' },
  { key: 'ibm', label: 'IBM（Granite）' }
];

export const MODELS: ModelOption[] = [
  // ---- Meta ----
  {
    key: 'fast',
    id: '@cf/meta/llama-3.2-1b-instruct',
    label: 'Llama 3.2 1B（默认·最快）',
    note: '响应最快，几乎不排队，适合日常闲聊',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'balanced',
    id: '@cf/meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B（均衡）',
    note: '比默认模型更聪明一点，速度依然很快',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'llama8b',
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    label: 'Llama 3.1 8B（更强）',
    note: '理解力更强，适合稍复杂的问题，速度略慢',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'llama8b-fp8',
    id: '@cf/meta/llama-3.1-8b-instruct-fp8',
    label: 'Llama 3.1 8B FP8',
    note: '8B 的量化版本，推理更省资源',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'scout',
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    note: '较新的中型模型，综合能力更强，速度中等',
    provider: 'meta',
    maxTokens: 8000
  },
  {
    key: 'llama70b',
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B（最强·较慢）',
    note: '目前最强的模型，回答质量最好，但速度最慢、消耗额度最多',
    provider: 'meta',
    // This model's context window is only 24,000 tokens total (input + output),
    // so we cap the output budget lower to leave room for prompt + history.
    maxTokens: 6000
  },

  // ---- Qwen ----
  {
    key: 'qwen30b',
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    label: 'Qwen3 30B',
    note: '阿里 Qwen 系列，中文理解能力出色',
    provider: 'qwen',
    maxTokens: 8000
  },
  {
    key: 'qwen-coder-32b',
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    label: 'Qwen2.5 Coder 32B',
    note: '代码能力强化版本，适合写代码、调试、解释代码',
    provider: 'qwen',
    maxTokens: 8000
  },
  {
    key: 'qwq32b',
    id: '@cf/qwen/qwq-32b',
    label: 'QwQ 32B（推理增强）',
    note: '带思考链的推理模型，适合较难的逻辑/数学问题，速度较慢',
    provider: 'qwen',
    maxTokens: 6000
  },

  // ---- Mistral AI ----
  {
    key: 'mistral24b',
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1 24B',
    note: '欧洲厂商模型，逻辑推理能力较强',
    provider: 'mistral',
    maxTokens: 8000
  },

  // ---- Google ----
  {
    key: 'gemma4-26b',
    id: '@cf/google/gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B',
    note: 'Google 最新一代开放模型，综合能力均衡',
    provider: 'google',
    maxTokens: 8000
  },

  // ---- OpenAI（开源权重版）----
  {
    key: 'gptoss120b',
    id: '@cf/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    note: 'OpenAI 开源权重大模型，推理能力强，适合复杂任务，速度较慢',
    provider: 'openai',
    maxTokens: 8000
  },
  {
    key: 'gptoss20b',
    id: '@cf/openai/gpt-oss-20b',
    label: 'GPT-OSS 20B',
    note: 'OpenAI 开源权重轻量版，速度更快，适合日常任务',
    provider: 'openai',
    maxTokens: 8000
  },

  // ---- DeepSeek ----
  {
    key: 'deepseek-r1-32b',
    id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    label: 'DeepSeek R1 Distill 32B',
    note: '带推理链的模型，擅长数学/逻辑类难题，速度较慢',
    provider: 'deepseek',
    maxTokens: 6000
  },

  // ---- Moonshot AI（Kimi）----
  {
    key: 'kimi-k2-6',
    id: '@cf/moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    note: '千亿参数级开源模型，支持超长上下文，综合能力强',
    provider: 'moonshot',
    maxTokens: 8000
  },
  {
    key: 'kimi-k2-7-code',
    id: '@cf/moonshotai/kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    note: '面向代码/智能体任务优化的版本',
    provider: 'moonshot',
    maxTokens: 8000
  },

  // ---- 智谱 AI（GLM）----
  {
    key: 'glm-4-7-flash',
    id: '@cf/zai-org/glm-4.7-flash',
    label: 'GLM-4.7 Flash',
    note: '快速多语言对话模型，性价比高，适合日常对话',
    provider: 'zhipu',
    maxTokens: 8000
  },
  {
    key: 'glm-5-2',
    id: '@cf/zai-org/glm-5.2',
    label: 'GLM-5.2',
    note: '智谱旗舰级模型，擅长复杂任务和智能体场景',
    provider: 'zhipu',
    maxTokens: 8000
  },

  // ---- NVIDIA ----
  {
    key: 'nemotron3-120b',
    id: '@cf/nvidia/nemotron-3-120b-a12b',
    label: 'Nemotron 3 120B',
    note: '面向多智能体场景的高精度模型，速度较慢',
    provider: 'nvidia',
    maxTokens: 8000
  },

  // ---- IBM ----
  {
    key: 'granite-4-micro',
    id: '@cf/ibm/granite-4.0-h-micro',
    label: 'Granite 4.0 Micro',
    note: '轻量级模型，适合边缘/低延迟场景，指令跟随能力强',
    provider: 'ibm',
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
