import type { ChatMessage, Env } from '../types/env';
import { getMaxTokensForModel } from '../config/models';


function summarizeAiError(err: unknown, modelId: string): { userMessage: string; logDetail: Record<string, unknown> } {
  const raw = err instanceof Error ? err.message : String(err);
  const statusMatch = raw.match(/(4\d\d|5\d\d)/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  let userMessage = '抱歉，AI 服务暂时出了点问题，请稍后再试。';
  let category = 'unknown';

  if (raw.includes('3036') || raw.includes('daily free allocation') || status === 429) {
    category = 'account_limited';
    userMessage = '抱歉，今日 AI 使用额度可能已用完，请稍后再试，或先切换到更轻量的模型。';
  } else if (raw.includes('3040')) {
    category = 'out_of_capacity';
    userMessage = '抱歉，当前模型服务较繁忙，请稍后重试，或先切换到更轻量的模型。';
  } else if (raw.includes('5007') || raw.includes('3042') || raw.includes('No such model') || raw.includes('Invalid model ID') || status === 404) {
    category = 'model_not_found';
    userMessage = `抱歉，当前模型暂时不可用（${modelId}），请切换到其他模型再试。`;
  } else if (raw.includes('5018') || raw.includes('3041') || raw.includes('3023') || raw.includes('5016') || status === 403) {
    category = 'forbidden';
    userMessage = '抱歉，当前账号暂时无法使用这个模型，请切换到其他模型再试。';
  } else if (raw.includes('3007') || raw.includes('3008') || raw.toLowerCase().includes('timeout') || status === 408) {
    category = 'timeout';
    userMessage = '抱歉，当前模型响应超时了，请稍后重试，或先切换到更轻量的模型。';
  } else if (raw.includes('3006') || status === 413) {
    category = 'request_too_large';
    userMessage = '抱歉，这次对话内容有点长，超出了当前模型允许范围；请先清空上下文，或切换到更强的长上下文模型。';
  } else if (raw.includes('5004') || raw.includes('3003') || raw.toLowerCase().includes('max_tokens') || raw.toLowerCase().includes('context') || status === 400) {
    category = 'invalid_request';
    userMessage = '抱歉，请求参数或上下文长度不适合当前模型；请换个模型，或先清空上下文后再试。';
  }

  return {
    userMessage,
    logDetail: {
      modelId,
      category,
      status,
      raw: raw.slice(0, 300)
    }
  };
}

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
    const resolvedModelId = modelId ?? env.AI_MODEL;
    const result = await env.AI.run(resolvedModelId, { messages, max_tokens: getMaxTokensForModel(resolvedModelId) });
    const output = readResponse(result).trim();
    const text = output || '我现在有点忙，请你换个问法再试一次。';
    const usage = readUsage(result) ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: estimateTokensFromText(text)
    };
    return { text, usage };
  } catch (err) {
    const summary = summarizeAiError(err, modelId ?? env.AI_MODEL);
    console.error('AI generation failed:', summary.logDetail);
    return {
      text: summary.userMessage,
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
    const resolvedModelId = modelId ?? env.AI_MODEL;
    const result = await env.AI.run(resolvedModelId, { messages, stream: true, max_tokens: getMaxTokensForModel(resolvedModelId) });

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
