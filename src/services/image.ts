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


export interface ImageEditInput {
  bytes: Uint8Array;
  mimeType?: string;
}

export async function editImage(env: Env, prompt: string, input: ImageEditInput): Promise<ImageGenerationResult> {
  try {
    const form = new FormData();
    form.set('prompt', prompt);
    const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
    form.set('input_image_0', new Blob([arrayBuffer], { type: input.mimeType ?? 'image/jpeg' }), 'input-image');

    const response = await (env.AI.run as any)('@cf/black-forest-labs/flux-2-klein-9b', { multipart: form });

    if (response instanceof ReadableStream) {
      const res = new Response(response);
      const imageBytes = new Uint8Array(await res.arrayBuffer());
      return { ok: true, imageBytes, mimeType: res.headers.get('content-type') ?? 'image/jpeg' };
    }

    if (typeof response === 'string') {
      return dataUriToBytes(response);
    }

    if (response && typeof response === 'object') {
      const data = response as Record<string, unknown>;
      if (typeof data.result === 'string') return dataUriToBytes(data.result);
      if (typeof data.image === 'string') return dataUriToBytes(data.image);
    }

    return { ok: false, error: 'unsupported_response' };
  } catch (err) {
    console.error('Image edit failed:', err);
    return { ok: false, error: 'edit_failed' };
  }
}
