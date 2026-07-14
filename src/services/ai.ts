import type { ChatMessage, Env } from '../types/env';

function trimMessages(messages: ChatMessage[]) {
  const budget = 6000;
  const picked: ChatMessage[] = [];
  let total = 0;

  for (const message of [...messages].reverse()) {
    total += message.content.length;
    if (total > budget) break;
    picked.push(message);
  }

  return picked.reverse();
}

function readResponse(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const data = result as Record<string, unknown>;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.text === 'string') return data.text;
  if (Array.isArray(data.result)) {
    return data.result
      .map((item) => (typeof item === 'string' ? item : ''))
      .join('')
      .trim();
  }
  return '';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

function readUsage(result: unknown): TokenUsage | null {
  if (!result || typeof result !== 'object') return null;
  const data = result as Record<string, unknown>;
  const usage = data.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  if (!promptTokens && !completionTokens) return null;
  return { promptTokens, completionTokens };
}

/**
 * Rough fallback token estimate when the API doesn't return a usage object
 * (this happens in streaming mode). ~1 token per ~2.5 characters works
 * reasonably for mixed Chinese/English text; it's an estimate, not exact billing.
 */
function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 2.5);
}

export async function generateReply(
  env: Env,
  history: ChatMessage[],
  input: string,
  systemPrompt: string,
  modelId?: string
): Promise<{ text: string; usage: TokenUsage }> {
  const messages = trimMessages([
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ]);

  try {
    const result = await env.AI.run(modelId ?? env.AI_MODEL, { messages, max_tokens: 2048 });
    const output = readResponse(result).trim();
    const text = output || '我现在有点忙，请你换个问法再试一次。';
    const usage = readUsage(result) ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: estimateTokensFromText(text)
    };
    return { text, usage };
  } catch (err) {
    console.error('AI generation failed:', err);
    return {
      text: '抱歉，AI 服务暂时出了点问题，请稍后再试。',
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }
}

function parseSseChunk(chunk: string): { delta: string; usage: TokenUsage | null } {
  let text = '';
  let usage: TokenUsage | null = null;
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]' || !payload) continue;
    try {
      const json = JSON.parse(payload);
      if (typeof json.response === 'string') text += json.response;
      if (json.usage) {
        usage = readUsage({ usage: json.usage });
      }
    } catch {
      // ignore malformed partial chunk
    }
  }
  return { delta: text, usage };
}

export interface StreamCallbacks {
  onChunk: (fullTextSoFar: string) => Promise<void> | void;
  onDone: (fullText: string) => Promise<void> | void;
  onError: (err: unknown) => Promise<void> | void;
}

export async function generateReplyStream(
  env: Env,
  history: ChatMessage[],
  input: string,
  systemPrompt: string,
  callbacks: StreamCallbacks,
  modelId?: string
): Promise<{ text: string; usage: TokenUsage }> {
  const messages = trimMessages([
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ]);

  try {
    const result = await env.AI.run(modelId ?? env.AI_MODEL, { messages, stream: true, max_tokens: 2048 });

    if (!(result instanceof ReadableStream)) {
      const fallback = readResponse(result).trim() || '我现在有点忙，请你换个问法再试一次。';
      await callbacks.onDone(fallback);
      const usage = readUsage(result) ?? {
        promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
        completionTokens: estimateTokensFromText(fallback)
      };
      return { text: fallback, usage };
    }

    const reader = result.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let streamUsage: TokenUsage | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const { delta, usage } = parseSseChunk(part);
        if (delta) {
          fullText += delta;
          await callbacks.onChunk(fullText);
        }
        if (usage) streamUsage = usage;
      }
    }

    const trailing = parseSseChunk(buffer);
    if (trailing.delta) fullText += trailing.delta;
    if (trailing.usage) streamUsage = trailing.usage;

    const finalText = fullText.trim() || '我现在有点忙，请你换个问法再试一次。';
    await callbacks.onDone(finalText);

    const usage = streamUsage ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: estimateTokensFromText(finalText)
    };
    return { text: finalText, usage };
  } catch (err) {
    console.error('AI streaming failed:', err);
    await callbacks.onError(err);
    const fallback = '抱歉，AI 服务暂时出了点问题，请稍后再试。';
    await callbacks.onDone(fallback);
    return { text: fallback, usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
