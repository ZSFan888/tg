import type { Env } from '../types/env';

export interface ImageGenerationResult {
  ok: boolean;
  imageBytes?: Uint8Array;
  mimeType?: string;
  error?: string;
  errorMessage?: string;
  httpStatus?: number;
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

    return { ok: false, error: 'unsupported_response', errorMessage: '模型返回了无法识别的图片结果格式' };
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

    return { ok: false, error: 'unsupported_response', errorMessage: '模型返回了无法识别的重绘结果格式' };
  } catch (err) {
    const detail = summarizeImageError(err);
    console.error('Image edit failed:', { prompt, ...detail, raw: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: detail.error === 'generation_failed' ? 'edit_failed' : detail.error, errorMessage: detail.errorMessage, httpStatus: detail.httpStatus };
  }
}
