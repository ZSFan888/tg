export interface ModelOption {
  key: string;
  id: string;
  label: string;
  note: string;
}

export const MODELS: ModelOption[] = [
  {
    key: 'fast',
    id: '@cf/meta/llama-3.2-1b-instruct',
    label: 'Llama 3.2 1B（默认·最快）',
    note: '响应最快，几乎不排队，适合日常闲聊'
  },
  {
    key: 'balanced',
    id: '@cf/meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B（均衡）',
    note: '比默认模型更聪明一点，速度依然很快'
  },
  {
    key: 'llama8b',
    id: '@cf/meta/llama-3.1-8b-instruct-fast',
    label: 'Llama 3.1 8B（更强）',
    note: '理解力更强，适合稍复杂的问题，速度略慢'
  },
  {
    key: 'llama8b-fp8',
    id: '@cf/meta/llama-3.1-8b-instruct-fp8',
    label: 'Llama 3.1 8B FP8',
    note: '8B 的量化版本，推理更省资源'
  },
  {
    key: 'scout',
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    note: '较新的中型模型，综合能力更强，速度中等'
  },
  {
    key: 'qwen30b',
    id: '@cf/qwen/qwen3-30b-a3b-fp8',
    label: 'Qwen3 30B',
    note: '阿里 Qwen 系列，中文理解能力出色'
  },
  {
    key: 'mistral24b',
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1 24B',
    note: '欧洲厂商模型，逻辑推理能力较强'
  },
  {
    key: 'llama70b',
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B（最强·较慢）',
    note: '目前最强的模型，回答质量最好，但速度最慢、消耗额度最多'
  }
];

export function getModelById(id?: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function getModelByKey(key?: string): ModelOption {
  return MODELS.find((m) => m.key === key) ?? MODELS[0];
}
