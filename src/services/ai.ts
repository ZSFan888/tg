import type { ChatMessage, Env } from '../types/env';
import { getMaxTokensForModel, getModelById } from '../config/models';



function isGroqModel(modelId: string): boolean {
  return getModelById(modelId).provider === 'groq';
}

// Groq 免费/开发者额度用尽时会返回 429，错误信息里通常带
// rate_limit_exceeded 或 too many requests；命中时自动降级到
// Cloudflare Workers AI，而不是直接把错误抛给用户。
function isGroqQuotaError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  return raw.includes('429')
    || lower.includes('rate_limit_exceeded')
    || lower.includes('too many requests');
}

function resolveGroqFallbackModelId(env: Env): string {
  return env.FALLBACK_AI_MODEL || env.AI_MODEL;
}

// Groq 免费额度（on_demand service tier）是按「输入 + 预留输出」一起计入
// 每分钟 TPM 上限的，如果 max_completion_tokens 设得比实际额度大，
// 请求会直接被拒绝（413 Request too large），而不是生成到一半才截断。
// 这里按各模型的免费 TPM 上限做保守预留，避免长对话把额度打满。
const GROQ_TPM_LIMITS: Record<string, number> = {
  'llama-3.1-8b-instant': 6000,
  'llama-3.3-70b-versatile': 12000,
  'openai/gpt-oss-20b': 8000,
  'openai/gpt-oss-120b': 8000,
  'groq/compound-mini': 70000,
  'groq/compound': 70000
};

function estimateTokensRough(text: string): number {
  return Math.ceil(text.length / 2.5);
}

async function runGroqChat(env: Env, messages: Array<{ role: string; content: string }>, modelId: string, stream = false) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured');

  const configuredMaxTokens = getMaxTokensForModel(modelId);
  const tpmLimit = GROQ_TPM_LIMITS[modelId] ?? configuredMaxTokens;
  const promptTokens = estimateTokensRough(messages.map((m) => m.content).join(''));
  // 给输入预留之外，至少留 200 tokens 给输出，否则短对话也会被拒绝。
  const safeBudget = Math.max(200, tpmLimit - promptTokens - 200);
  const maxTokens = Math.max(200, Math.min(configuredMaxTokens, safeBudget));

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    stream
  };
  if (/gpt-oss/i.test(modelId)) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`${res.status}: ${raw}`);
  }

  return stream ? res.body ?? new ReadableStream() : await res.json();
}

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
  } else if (raw.includes('3006') || status === 413 || raw.toLowerCase().includes('rate_limit_exceeded') || raw.toLowerCase().includes('tokens per minute')) {
    category = 'request_too_large';
    userMessage = '抱歉，这次对话内容有点长，超出了当前模型每分钟可用的额度；请先清空上下文，或切换到额度更高的模型。';
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

  const resolvedModelId = modelId ?? env.AI_MODEL;

  try {
    const result = isGroqModel(resolvedModelId)
      ? await runGroqChat(env, messages, resolvedModelId, false)
      : await env.AI.run(resolvedModelId, buildChatParams(messages, resolvedModelId));
    const output = readResponse(result).trim();
    const text = output || '我现在有点忙，请你换个问法再试一次。';
    const usage = readUsage(result) ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: Math.max(64, estimateTokensFromText(text))
    };
    return { text, usage };
  } catch (err) {
    if (isGroqModel(resolvedModelId) && isGroqQuotaError(err)) {
      const fallbackModelId = resolveGroqFallbackModelId(env);
      console.error('Groq quota exhausted, falling back to Workers AI:', { resolvedModelId, fallbackModelId });
      try {
        const result = await env.AI.run(fallbackModelId, buildChatParams(messages, fallbackModelId));
        const output = readResponse(result).trim();
        const text = output || '我现在有点忙，请你换个问法再试一次。';
        const usage = readUsage(result) ?? {
          promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
          completionTokens: Math.max(64, estimateTokensFromText(text))
        };
        return { text: `${text}\n\n（Groq 额度已用完，本次已自动切换到备用模型回答）`, usage };
      } catch (fallbackErr) {
        const summary = summarizeAiError(fallbackErr, fallbackModelId);
        console.error('Fallback AI generation also failed:', summary.logDetail);
        return {
          text: summary.userMessage,
          usage: { promptTokens: 0, completionTokens: 0 }
        };
      }
    }

    const summary = summarizeAiError(err, resolvedModelId);
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

  const resolvedModelId = modelId ?? env.AI_MODEL;
  let usedFallbackModelId: string | null = null;

  try {
    let result: unknown;
    try {
      result = isGroqModel(resolvedModelId)
        ? await runGroqChat(env, messages, resolvedModelId, true)
        : await env.AI.run(resolvedModelId, buildChatParams(messages, resolvedModelId, true));
    } catch (initialErr) {
      if (isGroqModel(resolvedModelId) && isGroqQuotaError(initialErr)) {
        usedFallbackModelId = resolveGroqFallbackModelId(env);
        console.error('Groq quota exhausted, falling back to Workers AI (stream):', {
          resolvedModelId,
          fallbackModelId: usedFallbackModelId
        });
        result = await env.AI.run(usedFallbackModelId, buildChatParams(messages, usedFallbackModelId, true));
      } else {
        throw initialErr;
      }
    }

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
    let lastChunkAt = Date.now();
    let stallFallback: ReturnType<typeof setInterval> | null = null;
    let stalled = false;

    // 之前一旦判定 stall 就直接触发 onError，会用一条通用错误文案
    // 覆盖掉已经生成出来的部分内容，等于把「已经吐出来的字」也一起丢了。
    // 现在改成：判定 stall 只负责取消底层的 reader，不再直接改写显示内容，
    // 已经攒到的 fullText 会在下面统一按「正常完成」流程处理并完整发出去。
    //
    // 之前这里的阈值是 20 秒，对大模型（70B / GLM / Kimi 等）来说太短了——
    // 这些模型在生成长回答时，两个 token 之间偶尔会有十几秒的停顿（排队、
    // 算力繁忙），并不代表真的卡死。20 秒的阈值会把这种正常的慢生成误判为
    // "已经结束"，只把已经生成出来的一半内容发给用户，导致回答看起来
    // "没说完"。Cloudflare Workers 在等待网络 I/O（没有占用 CPU 时间）时
    // 没有严格的墙钟超时限制，所以把阈值放宽到 60 秒更安全，能覆盖绝大多数
    // 模型排队/限速导致的短暂停顿，同时仍然能在真正掉线/卡死时兜底收尾。
    const STALL_TIMEOUT_MS = 60000;
    stallFallback = setInterval(() => {
      if (stalled) return;
      if (Date.now() - lastChunkAt < STALL_TIMEOUT_MS) return;
      stalled = true;
      try { reader.cancel('stream stalled'); } catch {}
    }, 5000);

    let streamError: unknown = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lastChunkAt = Date.now();

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
    } catch (readErr) {
      // 读取过程中网络中断/连接被关闭等：不要直接丢弃已生成内容，
      // 记录错误但继续走下面的「用已有内容收尾」逻辑。
      streamError = readErr;
    }

    if (stallFallback) clearInterval(stallFallback);

    const trailing = parseSseChunk(buffer);
    if (trailing.delta) fullText += trailing.delta;
    if (trailing.usage) streamUsage = trailing.usage;

    const trimmed = fullText.trim();

    if (!trimmed) {
      // 完全没生成出任何内容才走真正的错误提示。
      const summary = summarizeAiError(
        streamError ?? new Error(stalled ? 'STREAM_STALLED' : 'STREAM_EMPTY'),
        usedFallbackModelId ?? resolvedModelId
      );
      console.error('AI streaming produced no content:', summary.logDetail);
      await callbacks.onError(streamError ?? new Error('STREAM_EMPTY'));
      await callbacks.onDone(summary.userMessage);
      return { text: summary.userMessage, usage: { promptTokens: 0, completionTokens: 0 } };
    }

    if (stalled || streamError) {
      console.error(
        'AI streaming ended early, delivering partial content as final answer:',
        streamError ?? 'stalled'
      );
    }

    const finalText = usedFallbackModelId
      ? `${trimmed}\n\n（Groq 额度已用完，本次已自动切换到备用模型回答）`
      : trimmed;

    await callbacks.onDone(finalText);

    const usage = streamUsage ?? {
      promptTokens: estimateTokensFromText(messages.map((m) => m.content).join('')),
      completionTokens: Math.max(64, estimateTokensFromText(trimmed))
    };
    return { text: finalText, usage };
  } catch (err) {
    const summary = summarizeAiError(err, usedFallbackModelId ?? resolvedModelId);
    console.error('AI streaming failed:', summary.logDetail);
    await callbacks.onError(err);
    await callbacks.onDone(summary.userMessage);
    return { text: summary.userMessage, usage: { promptTokens: 0, completionTokens: 0 } };
  }
}
