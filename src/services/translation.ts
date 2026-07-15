import type { Env } from '../types/env';

export interface TranslationResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function translateText(env: Env, text: string, targetLang: string, sourceLang = 'auto', modelId = '@cf/facebook/m2m100-1.2b'): Promise<TranslationResult> {
  try {
    const result = await (env.AI.run as any)(modelId, {
      text,
      source_lang: sourceLang,
      target_lang: targetLang
    });

    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      const output = typeof data.translated_text === 'string'
        ? data.translated_text
        : typeof data.text === 'string'
        ? data.text
        : typeof data.result === 'string'
        ? data.result
        : '';
      if (output.trim()) return { ok: true, text: output.trim() };
    }

    if (typeof result === 'string' && result.trim()) {
      return { ok: true, text: result.trim() };
    }

    return { ok: false, error: 'empty_translation_result' };
  } catch (err) {
    console.error('Translation failed:', err);
    return { ok: false, error: 'translation_failed' };
  }
}
