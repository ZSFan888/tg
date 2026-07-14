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

export async function generateReply(
  env: Env,
  history: ChatMessage[],
  input: string,
  systemPrompt: string
) {
  const messages = trimMessages([
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ]);

  try {
    const result = await env.AI.run(env.AI_MODEL, { messages });
    const output = readResponse(result).trim();
    return output || '我现在有点忙，请你换个问法再试一次。';
  } catch (err) {
    console.error('AI generation failed:', err);
    return '抱歉，AI 服务暂时出了点问题，请稍后再试。';
  }
}

function parseSseChunk(chunk: string): string {
  let text = '';
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]' || !payload) continue;
    try {
      const json = JSON.parse(payload);
      if (typeof json.response === 'string') text += json.response;
    } catch {
      // ignore malformed partial chunk
    }
  }
  return text;
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
  callbacks: StreamCallbacks
) {
  const messages = trimMessages([
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ]);

  try {
    const result = await env.AI.run(env.AI_MODEL, { messages, stream: true });

    if (!(result instanceof ReadableStream)) {
      const fallback = readResponse(result).trim() || '我现在有点忙，请你换个问法再试一次。';
      await callbacks.onDone(fallback);
      return fallback;
    }

    const reader = result.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const delta = parseSseChunk(part);
        if (delta) {
          fullText += delta;
          await callbacks.onChunk(fullText);
        }
      }
    }

    const trailing = parseSseChunk(buffer);
    if (trailing) fullText += trailing;

    const finalText = fullText.trim() || '我现在有点忙，请你换个问法再试一次。';
    await callbacks.onDone(finalText);
    return finalText;
  } catch (err) {
    console.error('AI streaming failed:', err);
    await callbacks.onError(err);
    const fallback = '抱歉，AI 服务暂时出了点问题，请稍后再试。';
    await callbacks.onDone(fallback);
    return fallback;
  }
}
