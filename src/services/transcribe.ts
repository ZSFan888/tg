import type { Env } from '../types/env';

export interface TranscriptionResult {
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

export async function transcribeAudio(env: Env, fileUrl: string, modelId = '@cf/openai/whisper-large-v3-turbo'): Promise<TranscriptionResult> {
  try {
    const audioRes = await fetch(fileUrl);
    if (!audioRes.ok) {
      return { ok: false, error: `download_failed_${audioRes.status}` };
    }
    const buffer = await audioRes.arrayBuffer();

    if (buffer.byteLength > 20 * 1024 * 1024) {
      return { ok: false, error: 'file_too_large' };
    }

    const base64Audio = arrayBufferToBase64(buffer);

    const result = await env.AI.run(modelId, {
      audio: base64Audio,
      task: 'transcribe'
    });

    const data = result as { text?: string };
    const text = (data?.text ?? '').trim();

    if (!text) {
      return { ok: false, error: 'empty_transcription' };
    }

    return { ok: true, text };
  } catch (err) {
    console.error('Transcription failed:', err);
    return { ok: false, error: 'network_error' };
  }
}
