import type { Env } from '../types/env';

export interface VisionResult {
  ok: boolean;
  text?: string;
  error?: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function analyzeImage(env: Env, fileUrl: string, prompt: string, modelId = '@cf/llava-hf/llava-1.5-7b-hf'): Promise<VisionResult> {
  try {
    const imageRes = await fetch(fileUrl);
    if (!imageRes.ok) return { ok: false, error: `download_failed_${imageRes.status}` };
    const buffer = await imageRes.arrayBuffer();
    const image = arrayBufferToBase64(buffer);

    const result = await (env.AI.run as any)(modelId, {
      prompt,
      image
    });

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      const text = typeof data.description === 'string'
        ? data.description
        : typeof data.text === 'string'
        ? data.text
        : typeof data.result === 'string'
        ? data.result
        : '';
      if (text.trim()) return { ok: true, text: text.trim() };
    }

    if (typeof result === 'string' && result.trim()) {
      return { ok: true, text: result.trim() };
    }

    return { ok: false, error: 'empty_vision_result' };
  } catch (err) {
    console.error('Vision analyze failed:', err);
    return { ok: false, error: 'vision_failed' };
  }
}
