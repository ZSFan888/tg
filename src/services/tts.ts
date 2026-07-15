import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Env } from '../types/env';

export interface SpeechResult {
  ok: boolean;
  audioBytes?: Uint8Array;
  mimeType?: string;
  error?: string;
}

let ffmpegLoadPromise: Promise<boolean> | null = null;
let ffmpeg: FFmpeg | null = null;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getFfmpeg() {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!ffmpegLoadPromise) ffmpegLoadPromise = ffmpeg.load();
  await ffmpegLoadPromise;
  return ffmpeg;
}

async function convertMp3ToOggOpus(inputBytes: Uint8Array): Promise<Uint8Array> {
  const ff = await getFfmpeg();
  const inputName = `input-${Date.now()}.mp3`;
  const outputName = `output-${Date.now()}.ogg`;
  await ff.writeFile(inputName, new Uint8Array(inputBytes));
  await ff.exec(['-i', inputName, '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-ar', '48000', outputName]);
  const output = await ff.readFile(outputName);
  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile(outputName).catch(() => {});
  return output instanceof Uint8Array ? output : new Uint8Array(output as unknown as ArrayBuffer);
}

export async function synthesizeSpeech(env: Env, text: string, lang = 'zh'): Promise<SpeechResult> {
  try {
    const result = await env.AI.run('@cf/myshell-ai/melotts', {
      prompt: text.slice(0, 1200),
      lang
    });

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      const b64 = typeof data.audio === 'string' ? data.audio : typeof data.result === 'string' ? data.result : undefined;
      if (b64) {
        const mp3Bytes = base64ToBytes(b64);
        const oggBytes = await convertMp3ToOggOpus(mp3Bytes);
        return { ok: true, audioBytes: oggBytes, mimeType: 'audio/ogg' };
      }
    }

    return { ok: false, error: 'unsupported_response' };
  } catch (err) {
    console.error('Speech synthesis failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'synthesis_failed' };
  }
}
