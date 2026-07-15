import type { Env } from '../types/env';

export interface ImageGenerationResult {
  ok: boolean;
  imageBytes?: Uint8Array;
  mimeType?: string;
  error?: string;
}

function dataUriToBytes(dataUri: string): ImageGenerationResult {
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return { ok: false, error: 'invalid_data_uri' };
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { ok: true, imageBytes: bytes, mimeType };
}

export async function generateImage(env: Env, prompt: string): Promise<ImageGenerationResult> {
  try {
    const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt,
      steps: 4
    });

    if (result instanceof ReadableStream) {
      const response = new Response(result);
      const imageBytes = new Uint8Array(await response.arrayBuffer());
      return { ok: true, imageBytes, mimeType: response.headers.get('content-type') ?? 'image/jpeg' };
    }

    if (typeof result === 'string') {
      return dataUriToBytes(result);
    }

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      if (typeof data.result === 'string') return dataUriToBytes(data.result);
      if (typeof data.image === 'string') return dataUriToBytes(data.image);
    }

    return { ok: false, error: 'unsupported_response' };
  } catch (err) {
    console.error('Image generation failed:', err);
    return { ok: false, error: 'generation_failed' };
  }
}
