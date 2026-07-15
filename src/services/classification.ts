import type { Env } from '../types/env';

export interface ClassificationResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function classifyText(env: Env, text: string, modelId = '@cf/huggingface/distilbert-sst-2-int8'): Promise<ClassificationResult> {
  try {
    const result = await (env.AI.run as any)(modelId, { text });

    if (Array.isArray(result) && result.length > 0) {
      const top = result[0] as Record<string, unknown>;
      const label = String(top.label ?? top.class_name ?? 'unknown');
      const score = typeof top.score === 'number' ? `${(top.score * 100).toFixed(1)}%` : '';
      return { ok: true, text: `${label}${score ? `（置信度 ${score}）` : ''}` };
    }

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      const label = typeof data.label === 'string' ? data.label : typeof data.result === 'string' ? data.result : '';
      if (label) return { ok: true, text: label };
    }

    if (typeof result === 'string' && result.trim()) {
      return { ok: true, text: result.trim() };
    }

    return { ok: false, error: 'empty_classification_result' };
  } catch (err) {
    console.error('Classification failed:', err);
    return { ok: false, error: 'classification_failed' };
  }
}
