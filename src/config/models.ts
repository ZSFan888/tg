import type { ModelTask } from '../types/env';

export interface ModelOption {
  key: string;
  id: string;
  label: string;
  note: string;
  provider: string;
  task: ModelTask;
  deprecated?: boolean;
  freePlanOnly?: boolean;
  recommendedRank: number;
  speedRank?: number;
  qualityRank?: number;
  maxTokens: number;
}

export interface ProviderGroup {
  key: string;
  label: string;
}

export interface TaskGroup {
  key: ModelTask;
  label: string;
}

export const TASKS: TaskGroup[] = [
  { key: 'chat', label: '聊天对话' },
  { key: 'speech_to_text', label: '语音转文字' },
  { key: 'text_to_speech', label: '文字转语音' },
  { key: 'image', label: '图片生成' },
  { key: 'vision', label: '图像理解' },
  { key: 'translation', label: '翻译' },
  { key: 'embedding', label: '向量嵌入' },
  { key: 'rerank', label: '重排排序' },
  { key: 'classification', label: '分类识别' }
];

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
  { key: 'ibm', label: 'IBM（Granite）' },
  { key: 'deepgram', label: 'Deepgram' },
  { key: 'black-forest-labs', label: 'Black Forest Labs' },
  { key: 'stabilityai', label: 'Stability AI' },
  { key: 'baai', label: 'BAAI' },
  { key: 'cohere', label: 'Cohere' },
  { key: 'facebook', label: 'Facebook / Meta Research' }
];

export const MODELS: ModelOption[] = [
  { key: 'fast', id: '@cf/meta/llama-3.2-1b-instruct', label: 'Llama 3.2 1B（默认·最快）', note: '响应最快，适合日常聊天', provider: 'meta', task: 'chat', recommendedRank: 3, speedRank: 1, qualityRank: 8, maxTokens: 8000 },
  { key: 'balanced', id: '@cf/meta/llama-3.2-3b-instruct', label: 'Llama 3.2 3B（均衡）', note: '速度和质量更均衡', provider: 'meta', task: 'chat', recommendedRank: 1, speedRank: 2, qualityRank: 7, maxTokens: 8000 },
  { key: 'llama8b', id: '@cf/meta/llama-3.1-8b-instruct-fast', label: 'Llama 3.1 8B', note: '更强的通用聊天模型', provider: 'meta', task: 'chat', recommendedRank: 2, speedRank: 3, qualityRank: 6, maxTokens: 8000 },
  { key: 'scout', id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', note: '综合能力更强', provider: 'meta', task: 'chat', recommendedRank: 4, speedRank: 5, qualityRank: 4, maxTokens: 8000 },
  { key: 'llama70b', id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B', note: '高质量聊天与推理', provider: 'meta', task: 'chat', recommendedRank: 8, speedRank: 10, qualityRank: 1, maxTokens: 6000 },
  { key: 'qwen30b', id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen3 30B', note: '中文表现出色', provider: 'qwen', task: 'chat', recommendedRank: 5, speedRank: 6, qualityRank: 5, maxTokens: 8000 },
  { key: 'qwen-coder-32b', id: '@cf/qwen/qwen2.5-coder-32b-instruct', label: 'Qwen2.5 Coder 32B', note: '代码能力强化', provider: 'qwen', task: 'chat', recommendedRank: 7, speedRank: 7, qualityRank: 3, maxTokens: 8000 },
  { key: 'qwq32b', id: '@cf/qwen/qwq-32b', label: 'QwQ 32B', note: '推理增强', provider: 'qwen', task: 'chat', recommendedRank: 9, speedRank: 11, qualityRank: 2, maxTokens: 6000 },
  { key: 'mistral24b', id: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1 24B', note: '逻辑较强', provider: 'mistral', task: 'chat', recommendedRank: 6, speedRank: 8, qualityRank: 5, maxTokens: 8000 },
  { key: 'gemma4-26b', id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B', note: 'Google 开放模型', provider: 'google', task: 'chat', recommendedRank: 10, speedRank: 9, qualityRank: 9, maxTokens: 8000 },
  { key: 'gptoss120b', id: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', note: '复杂任务更强', provider: 'openai', task: 'chat', recommendedRank: 11, speedRank: 4, qualityRank: 2, maxTokens: 8000 },
  { key: 'gptoss20b', id: '@cf/openai/gpt-oss-20b', label: 'GPT-OSS 20B', note: '更快的开源 OpenAI 模型', provider: 'openai', task: 'chat', recommendedRank: 12, speedRank: 4, qualityRank: 4, maxTokens: 8000 },
  { key: 'deepseek-r1-32b', id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 Distill 32B', note: '数学逻辑更强', provider: 'deepseek', task: 'chat', recommendedRank: 13, speedRank: 12, qualityRank: 3, maxTokens: 6000 },
  { deprecated: true, key: 'kimi-k2-6', id: '@cf/moonshotai/kimi-k2.6', label: 'Kimi K2.6', note: '长上下文聊天', provider: 'moonshot', task: 'chat', recommendedRank: 0, maxTokens: 8000 },
  { deprecated: true, key: 'kimi-k2-7-code', id: '@cf/moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code', note: '代码优化版本', provider: 'moonshot', task: 'chat', recommendedRank: 0, maxTokens: 8000 },
  { key: 'glm-4-7-flash', id: '@cf/zai-org/glm-4.7-flash', label: 'GLM-4.7 Flash', note: '快速多语言聊天', provider: 'zhipu', task: 'chat', recommendedRank: 0, maxTokens: 8000 },
  { deprecated: true, key: 'glm-5-2', id: '@cf/zai-org/glm-5.2', label: 'GLM-5.2', note: '智谱旗舰模型', provider: 'zhipu', task: 'chat', recommendedRank: 0, maxTokens: 8000 },
  { deprecated: true, key: 'nemotron3-120b', id: '@cf/nvidia/nemotron-3-120b-a12b', label: 'Nemotron 3 120B', note: '多智能体场景', provider: 'nvidia', task: 'chat', recommendedRank: 0, maxTokens: 8000 },
  { key: 'granite-4-micro', id: '@cf/ibm/granite-4.0-h-micro', label: 'Granite 4.0 Micro', note: '低延迟轻量聊天', provider: 'ibm', task: 'chat', recommendedRank: 0, maxTokens: 8000 },

  { key: 'whisper', id: '@cf/openai/whisper', label: 'Whisper', note: '通用语音转文字', provider: 'openai', task: 'speech_to_text', recommendedRank: 2, maxTokens: 0 },
  { key: 'whisper-large-v3-turbo', id: '@cf/openai/whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo', note: '更快更强的 ASR', provider: 'openai', task: 'speech_to_text', recommendedRank: 1, maxTokens: 0 },
  { key: 'deepgram-nova-3', id: '@cf/deepgram/nova-3', label: 'Deepgram Nova-3', note: '高质量语音识别', provider: 'deepgram', task: 'speech_to_text', recommendedRank: 3, maxTokens: 0 },

  { key: 'melotts', id: '@cf/myshell-ai/melotts', label: 'MeloTTS', note: '多语言文字转语音', provider: 'deepgram', task: 'text_to_speech', recommendedRank: 1, maxTokens: 0 },

  { key: 'flux-schnell', id: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 Schnell', note: '快速图片生成', provider: 'black-forest-labs', task: 'image', recommendedRank: 1, maxTokens: 0 },
  { key: 'sd-xl-base', id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base 1.0', note: '高质量图片生成', provider: 'stabilityai', task: 'image', recommendedRank: 2, maxTokens: 0 },

  { key: 'llava-7b', id: '@cf/llava-hf/llava-1.5-7b-hf', label: 'LLaVA 1.5 7B', note: '图像理解与问答', provider: 'meta', task: 'vision', recommendedRank: 1, maxTokens: 4000 },
  { key: 'moondream', id: '@cf/vikhyatk/moondream2', label: 'Moondream 2', note: '轻量视觉问答', provider: 'meta', task: 'vision', recommendedRank: 2, maxTokens: 4000 },

  { key: 'm2m100', id: '@cf/facebook/m2m100-1.2b', label: 'M2M100 1.2B', note: '多语言翻译', provider: 'facebook', task: 'translation', recommendedRank: 1, maxTokens: 0 },

  { key: 'bge-base-en', id: '@cf/baai/bge-base-en-v1.5', label: 'BGE Base EN v1.5', note: '英文向量嵌入', provider: 'baai', task: 'embedding', recommendedRank: 2, maxTokens: 0 },
  { key: 'bge-large-zh', id: '@cf/baai/bge-large-zh-v1.5', label: 'BGE Large ZH v1.5', note: '中文向量嵌入', provider: 'baai', task: 'embedding', recommendedRank: 1, maxTokens: 0 },

  { key: 'bge-reranker-base', id: '@cf/baai/bge-reranker-base', label: 'BGE Reranker Base', note: '检索结果重排', provider: 'baai', task: 'rerank', recommendedRank: 1, maxTokens: 0 },

  { key: 'distilbert-sst2', id: '@cf/huggingface/distilbert-sst-2-int8', label: 'DistilBERT SST-2', note: '情感/二分类', provider: 'cohere', task: 'classification', recommendedRank: 1, maxTokens: 0 }
];

const DEFAULT_MAX_TOKENS = 8000;

export function getModelById(id?: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function getModelByKey(key?: string): ModelOption {
  return MODELS.find((m) => m.key === key) ?? MODELS[0];
}

export function getModelsByProvider(providerKey: string): ModelOption[] {
  return MODELS
    .filter((m) => m.provider === providerKey && !m.deprecated)
    .sort((a, b) => a.recommendedRank - b.recommendedRank || a.label.localeCompare(b.label, 'zh-CN'));
}

export function getModelsByTask(task: ModelTask): ModelOption[] {
  return MODELS
    .filter((m) => m.task === task && !m.deprecated)
    .sort((a, b) => a.recommendedRank - b.recommendedRank || a.label.localeCompare(b.label, 'zh-CN'));
}

export function getProvidersByTask(task: ModelTask): ProviderGroup[] {
  const providerKeys = new Set(
    MODELS.filter((m) => m.task === task && !m.deprecated).map((m) => m.provider)
  );
  return PROVIDERS.filter((p) => providerKeys.has(p.key));
}

export function getProviderByKey(key?: string): ProviderGroup | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

export function getTaskByKey(key?: string): TaskGroup | undefined {
  return TASKS.find((t) => t.key === key);
}

export function getMaxTokensForModel(id?: string): number {
  if (!id) return DEFAULT_MAX_TOKENS;
  const model = MODELS.find((m) => m.id === id);
  return model?.maxTokens ?? DEFAULT_MAX_TOKENS;
}


export function getRecommendedModelForTask(task: ModelTask): ModelOption {
  return getModelsByTask(task)[0] ?? MODELS[0];
}

export function pickChatModelByIntent(input: string): ModelOption {
  const text = input.toLowerCase();
  const hardKeywords = ['数学', '推理', '证明', '算法', '代码', 'debug', 'bug', 'sql', 'python', 'typescript', '复杂', '分析'];
  const fastKeywords = ['一句话', '简短', '快速', '马上', '简单问答'];
  const chatModels = getModelsByTask('chat');
  if (fastKeywords.some((kw) => text.includes(kw))) {
    return [...chatModels].sort((a, b) => (a.speedRank ?? 999) - (b.speedRank ?? 999))[0] ?? chatModels[0];
  }
  if (hardKeywords.some((kw) => text.includes(kw)) || input.length > 500) {
    return [...chatModels].sort((a, b) => (a.qualityRank ?? 999) - (b.qualityRank ?? 999))[0] ?? chatModels[0];
  }
  return getRecommendedModelForTask('chat');
}


export function pickImageModelByIntent(input: string): ModelOption {
  const text = input.toLowerCase();
  const imageModels = getModelsByTask('image');
  const highQualityKeywords = ['超清', '高清', '高质量', '细节', '写实', '电影感', 'photorealistic', 'realistic', 'detailed', 'cinematic'];
  const fastKeywords = ['快速', '随便画', '草图', '简单', '马上', '快一点'];
  if (highQualityKeywords.some((kw) => text.includes(kw)) || input.length > 180) {
    return imageModels.find((m) => m.key === 'sd-xl-base') ?? imageModels[0];
  }
  if (fastKeywords.some((kw) => text.includes(kw))) {
    return imageModels.find((m) => m.key === 'flux-schnell') ?? imageModels[0];
  }
  return getRecommendedModelForTask('image');
}


export function pickVisionModelByIntent(input: string): ModelOption {
  const text = input.toLowerCase();
  const visionModels = getModelsByTask('vision');
  const deepAnalysisKeywords = ['详细分析', '分析原因', '逐步分析', '识别细节', '比较', '解释为什么', 'analyze', 'compare', 'explain'];
  const simpleKeywords = ['这是什么', '图里有什么', '帮我看看', '描述一下', 'what is this', 'what is in this image', 'describe'];
  if (deepAnalysisKeywords.some((kw) => text.includes(kw)) || input.length > 120) {
    return visionModels.find((m) => m.key === 'llava-7b') ?? visionModels[0];
  }
  if (simpleKeywords.some((kw) => text.includes(kw))) {
    return visionModels.find((m) => m.key === 'moondream') ?? visionModels[0];
  }
  return getRecommendedModelForTask('vision');
}
