import type { ChatMessage, Env } from '../types/env';
import { estimateChatNeurons, recordNeuronUsage } from '../storage/neurons-store';
import { getMaxTokensForModel } from '../config/models';

function buildChatParams(messages: ChatMessage[], modelId: string) {
  const maxTokens = Math.min(512, getMaxTokensForModel(modelId));
  const usesCompletionTokens = /@cf\/(zai-org\/glm-|moonshotai\/kimi-|openai\/gpt-oss-|nvidia\/nemotron-3-120b-a12b)/.test(modelId);

  if (usesCompletionTokens) {
    return {
      messages,
      max_completion_tokens: maxTokens
    };
  }

  return {
    messages,
    max_tokens: maxTokens
  };
}

function readResponse(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const data = result as Record<string, unknown>;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.text === 'string') return data.text;
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const choice = data.choices[0] as Record<string, unknown>;
    const message = choice?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content;
  }
  if (Array.isArray(data.result)) {
    return data.result.map((item) => (typeof item === 'string' ? item : '')).join('').trim();
  }
  return '';
}

export async function generateFollowUps(
  env: Env,
  userQuestion: string,
  aiAnswer: string,
  modelId?: string
): Promise<string[]> {
  const resolvedModelId = modelId ?? env.AI_MODEL;
  const prompt = `根据下面这轮问答，生成 3 个用户可能会追问的简短问题。要求：
- 每个问题不超过 15 个字
- 直接和上面的回答内容相关，不要泛泛而问
- 只输出问题本身，每行一个，不要编号、不要引号、不要多余说明

用户问题：${userQuestion}
AI 回答：${aiAnswer.slice(0, 800)}`;

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个只输出简短追问建议的助手，严格按格式输出，不要多余文字。' },
      { role: 'user', content: prompt }
    ];

    const result = await env.AI.run(resolvedModelId, buildChatParams(messages, resolvedModelId));
    const text = readResponse(result).trim();

    const usageObj = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
    const promptTokens = usageObj?.prompt_tokens ?? Math.ceil(prompt.length / 2.5);
    const completionTokens = usageObj?.completion_tokens ?? Math.max(32, Math.ceil(text.length / 2.5));
    await recordNeuronUsage(env, estimateChatNeurons(resolvedModelId, promptTokens, completionTokens), 'chat');

    const lines = text
      .split('\n')
      .map((l) => l.replace(/^[-*\d.、\s]+/, '').trim())
      .filter((l) => l.length > 0 && l.length <= 40)
      .slice(0, 3);

    return lines;
  } catch (err) {
    console.error('Follow-up generation failed:', err);
    return [];
  }
}
