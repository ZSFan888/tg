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
