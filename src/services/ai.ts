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

  // 临时调试：把原始错误摘要附加到用户可见的提示里，方便快速定位到底是
  // 网络异常、参数不兼容还是权限问题，而不用去翻 Cloudflare 后台日志。
  // 定位完成后应移除这行 debugSuffix 拼接。
  const debugSuffix = raw ? `\n\n[调试信息] ${raw.slice(0, 200)}` : '';

  return {
    userMessage: `${userMessage}${debugSuffix}`,
    logDetail: {
      modelId,
      category,
      status,
      raw: raw.slice(0, 300)
    }
  };
}

function readResponse(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const data = result as Record<string, unknown>;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.text === 'string') return data.text;
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    // OpenAI-compatible non-streaming format used by newer models
    // (GLM, Kimi, GPT-OSS, Nemotron, etc.): choices[0].message.content
    const choice = data.choices[0] as Record<string, unknown>;
    const message = choice?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content;
  }
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



function buildChatParams(messages: Array<{ role: string; content: string }>, modelId: string, stream = false) {
  const maxTokens = getMaxTokensForModel(modelId);
  const usesCompletionTokens = /@cf\/(zai-org\/glm-|moonshotai\/kimi-|openai\/gpt-oss-|nvidia\/nemotron-3-120b-a12b)/.test(modelId);

  if (usesCompletionTokens) {
    return {
      messages,
      stream,
      max_completion_tokens: maxTokens
    };
  }

  return {
    messages,
    stream,
    max_tokens: maxTokens
  };
}

export async function optimizeImagePrompt(
  env: Env,
  userPrompt: string
): Promise<{ optimizedPrompt: string; briefTip?: string }> {
  const systemPrompt = [
    '你是一个专业的中文 AI 生图提示词优化器。',
    '你的任务是把用户随口说的中文需求，改写成更适合 FLUX 文生图模型的高质量提示词。',
    '必须保留用户原意，不要擅自改题，不要凭空加入不相关主体。',
    '优先补全这些要素：主体、场景、构图、镜头远近、光线、时间、材质、色调、风格、用途。',
    '如果用户需求过短或过模糊，也不要反问；直接做最稳妥的合理补全。',
    '输出 JSON，格式固定为 {"optimizedPrompt":"...","briefTip":"..."}。',
    'briefTip 用一句简短中文概括你补强了哪些信息，20 字以内。',
    'optimizedPrompt 必须是适合直接送去生图的中文长提示词，不要带解释，不要带 markdown。'
  ].join('\n');

  try {
    const modelId = env.AI_MODEL;
    const result = await env.AI.run(modelId, buildChatParams([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], modelId));
    const raw = readResponse(result).trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { optimizedPrompt?: string; briefTip?: string };
      if (parsed.optimizedPrompt?.trim()) {
        return {
          optimizedPrompt: parsed.optimizedPrompt.trim(),
          briefTip: parsed.briefTip?.trim() || undefined
        };
      }
    }
  } catch (err) {
    console.error('Image prompt optimization failed:', err instanceof Error ? err.message : String(err));
  }

  return {
    optimizedPrompt: userPrompt,
    briefTip: '已按原描述直接生成'
  };
}

export async function generateReply(
  env: Env,
  history: ChatMessage[],
  input: string,
  systemPrompt: string,
  modelId?: string
): Promise<{ text: string; usage: TokenUsage }> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ];

  try {
    const resolvedModelId = modelId ?? env.AI_MODEL;
    const result = await env.AI.run(resolvedModelId, buildChatParams(messages, resolvedModelId));
    const output = readResponse(result).trim();
    const text = output || '我现在有点忙，请你换个问法再试一次。';
    const usage = readUsage(result) ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: Math.max(64, estimateTokensFromText(text))
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
      if (typeof json.response === 'string') {
        text += json.response;
      } else if (Array.isArray(json.choices) && json.choices.length > 0) {
        // OpenAI-compatible streaming format used by newer models
        // (GLM, Kimi, GPT-OSS, Nemotron, etc.): choices[0].delta.content
        const delta = json.choices[0]?.delta;
        if (typeof delta?.content === 'string') text += delta.content;
      }
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
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: input }
  ];

  try {
    const resolvedModelId = modelId ?? env.AI_MODEL;
    const result = await env.AI.run(resolvedModelId, buildChatParams(messages, resolvedModelId, true));

    if (!(result instanceof ReadableStream)) {
      const fallback = readResponse(result).trim() || '我现在有点忙，请你换个问法再试一次。';
      await callbacks.onDone(fallback);
      const usage = readUsage(result) ?? {
        promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
        completionTokens: Math.max(
          64,
          estimateTokensFromText(fallback)
        )
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
    const summary = summarizeAiError(err, modelId ?? env.AI_MODEL);
    console.error('AI streaming failed:', summary.logDetail);
    await callbacks.onError(err);
    await callbacks.onDone(summary.userMessage);
    return { text: summary.userMessage, usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
