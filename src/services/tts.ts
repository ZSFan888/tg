import type { Env } from '../types/env';

export interface SpeechResult {
  ok: boolean;
  audioBytes?: Uint8Array;
  mimeType?: string;
  error?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function synthesizeSpeech(env: Env, text: string, lang = 'ZH'): Promise<SpeechResult> {
  try {
    const result = await env.AI.run('@cf/myshell-ai/melotts', {
      prompt: text.slice(0, 1200),
      lang
    });

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      const b64 = typeof data.audio === 'string' ? data.audio : typeof data.result === 'string' ? data.result : undefined;
      if (b64) {
        return { ok: true, audioBytes: base64ToBytes(b64), mimeType: 'audio/ogg' };
      }
    }

    return { ok: false, error: 'unsupported_response' };
  } catch (err) {
    console.error('Speech synthesis failed:', err);
    return { ok: false, error: 'synthesis_failed' };
  }
}
