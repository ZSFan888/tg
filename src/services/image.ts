import type { Env } from '../types/env';

export interface ImageGenerationResult {
  ok: boolean;
  imageBytes?: Uint8Array;
  mimeType?: string;
  error?: string;
  errorMessage?: string;
  httpStatus?: number;
}



function normalizeBase64ImageString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  const looksLikeBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 64;
  if (!looksLikeBase64) return null;
  return `data:image/jpeg;base64,${trimmed.replace(/\s+/g, '')}`;
}

async function binaryLikeToResult(input: unknown, defaultMimeType = 'image/jpeg'): Promise<ImageGenerationResult | null> {
  if (input instanceof Response) {
    const imageBytes = new Uint8Array(await input.arrayBuffer());
    return { ok: true, imageBytes, mimeType: input.headers.get('content-type') ?? defaultMimeType };
  }

  if (input instanceof ReadableStream) {
    const response = new Response(input);
    const imageBytes = new Uint8Array(await response.arrayBuffer());
    return { ok: true, imageBytes, mimeType: response.headers.get('content-type') ?? defaultMimeType };
  }

  if (input instanceof Uint8Array) {
    return { ok: true, imageBytes: input, mimeType: defaultMimeType };
  }

  if (input instanceof ArrayBuffer) {
    return { ok: true, imageBytes: new Uint8Array(input), mimeType: defaultMimeType };
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const imageBytes = new Uint8Array(await input.arrayBuffer());
    return { ok: true, imageBytes, mimeType: input.type || defaultMimeType };
  }

  return null;
}

async function parseImageResult(result: unknown, defaultMimeType = 'image/jpeg'): Promise<ImageGenerationResult> {
  const direct = await binaryLikeToResult(result, defaultMimeType);
  if (direct) return direct;

  if (typeof result === 'string') {
    const normalized = normalizeBase64ImageString(result);
    if (normalized) return dataUriToBytes(normalized);
    return { ok: false, error: 'unsupported_response', errorMessage: '模型返回了无法识别的字符串图片格式' };
  }

  if (result && typeof result === 'object') {
    const data = result as Record<string, unknown>;
    for (const key of ['result', 'image', 'output', 'data']) {
      const value = data[key];
      const nested = await binaryLikeToResult(value, defaultMimeType);
      if (nested) return nested;
      if (typeof value === 'string') {
        const normalized = normalizeBase64ImageString(value);
        if (normalized) return dataUriToBytes(normalized);
      }
      if (value && typeof value === 'object' && 'image' in (value as Record<string, unknown>)) {
        const inner = (value as Record<string, unknown>).image;
        const nestedInner = await binaryLikeToResult(inner, defaultMimeType);
        if (nestedInner) return nestedInner;
        if (typeof inner === 'string') {
          const normalized = normalizeBase64ImageString(inner);
          if (normalized) return dataUriToBytes(normalized);
        }
      }
    }
  }

  return { ok: false, error: 'unsupported_response', errorMessage: '模型返回了无法识别的图片结果格式' };
}

function summarizeImageError(err: unknown): { error: string; errorMessage: string; httpStatus?: number } {
  if (err instanceof Error) {
    const message = err.message || 'unknown_error';
    const statusMatch = message.match(/\b(4\d\d|5\d\d)\b/);
    const status = statusMatch ? Number(statusMatch[1]) : undefined;

    if (message.includes('3036') || message.includes('daily free allocation') || status === 429) {
      return { error: 'account_limited', errorMessage: '今日图片额度可能已用完，请稍后再试', httpStatus: status };
    }
    if (message.includes('3040')) {
      return { error: 'out_of_capacity', errorMessage: '当前图片生成服务较繁忙，请稍后重试', httpStatus: status };
    }
    if (message.includes('3007') || message.includes('3008') || status === 408) {
      return { error: 'timeout', errorMessage: '图片生成超时，请简化描述后再试', httpStatus: status };
    }
    if (message.includes('3006') || status === 413) {
      return { error: 'request_too_large', errorMessage: '请求内容过大，请缩短描述后再试', httpStatus: status };
    }
    if (message.includes('5004') || message.includes('3003') || status === 400) {
      return { error: 'invalid_request', errorMessage: '图片请求参数无效，请换个描述再试', httpStatus: status };
    }
    if (message.includes('5018') || message.includes('3041') || message.includes('3023') || status === 403) {
      return { error: 'forbidden', errorMessage: '当前账号暂时无法使用图片模型，请检查权限或稍后再试', httpStatus: status };
    }

    return { error: 'generation_failed', errorMessage: message.slice(0, 160), httpStatus: status };
  }
  return { error: 'generation_failed', errorMessage: 'unknown_error' };
}

function dataUriToBytes(dataUri: string): ImageGenerationResult {
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return { ok: false, error: 'invalid_data_uri', errorMessage: '返回的图片数据格式不正确' };
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { ok: true, imageBytes: bytes, mimeType };
}

export async function generateImage(env: Env, prompt: string, modelId = '@cf/black-forest-labs/flux-1-schnell'): Promise<ImageGenerationResult> {
  try {
    const result = await env.AI.run(modelId, {
      prompt,
      steps: 4
    });

    return await parseImageResult(result, 'image/jpeg');
  } catch (err) {
    const detail = summarizeImageError(err);
    console.error('Image generation failed:', { prompt, ...detail, raw: err instanceof Error ? err.message : String(err) });
    return { ok: false, ...detail };
  }
}


export interface ImageEditInput {
  bytes: Uint8Array;
  mimeType?: string;
}

export async function editImage(env: Env, prompt: string, input: ImageEditInput, modelId = '@cf/black-forest-labs/flux-2-klein-9b'): Promise<ImageGenerationResult> {
  try {
    const form = new FormData();
    form.set('prompt', prompt);
    const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
    form.set('input_image_0', new Blob([arrayBuffer], { type: input.mimeType ?? 'image/jpeg' }), 'input-image');

    const response = await (env.AI.run as any)(modelId, { multipart: form });

    const parsed = await parseImageResult(response, 'image/jpeg');
    if (!parsed.ok && parsed.error === 'unsupported_response') {
      return { ...parsed, errorMessage: '模型返回了无法识别的重绘结果格式' };
    }
    return parsed;
  } catch (err) {
    const detail = summarizeImageError(err);
    console.error('Image edit failed:', { prompt, ...detail, raw: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: detail.error === 'generation_failed' ? 'edit_failed' : detail.error, errorMessage: detail.errorMessage, httpStatus: detail.httpStatus };
  }
}
