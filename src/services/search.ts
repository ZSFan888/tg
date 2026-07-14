import type { Env } from '../types/env';

export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

export interface SearchOutcome {
  ok: boolean;
  answer?: string;
  results: SearchResultItem[];
  error?: string;
}

export async function searchWeb(env: Env, query: string): Promise<SearchOutcome> {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) {
    return { ok: false, results: [], error: 'no_api_key' };
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5
      })
    });

    if (!res.ok) {
      return { ok: false, results: [], error: `http_${res.status}` };
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string }>;
    };

    return {
      ok: true,
      answer: data.answer,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content
      }))
    };
  } catch (err) {
    console.error('Tavily search failed:', err);
    return { ok: false, results: [], error: 'network_error' };
  }
}

export function buildSearchContext(outcome: SearchOutcome, query: string): string {
  if (!outcome.ok || outcome.results.length === 0) {
    return '';
  }

  const parts = [`以下是关于"${query}"的最新网络搜索结果，请结合这些信息回答用户的问题，并在回答末尾列出信息来源链接：`];

  if (outcome.answer) {
    parts.push(`\n参考摘要：${outcome.answer}`);
  }

  outcome.results.forEach((r, i) => {
    parts.push(`\n[${i + 1}] ${r.title}\n${r.content.slice(0, 500)}\n来源：${r.url}`);
  });

  return parts.join('\n');
}
