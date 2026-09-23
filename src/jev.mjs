import { openRouterKey } from './config.mjs';

export const JEV_MODEL = 'typesafe/jev-1.13';
const URL = 'https://openrouter.ai/api/alpha/decisions';

export class JevClient {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
    this.apiKey = apiKey ?? openRouterKey();
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async decide(state, questions, { signal } = {}) {
    if (!questions || Object.keys(questions).length === 0) {
      throw new Error('Jev requires at least one question');
    }
    const started = performance.now();
    const response = await this.fetchImpl(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ddy314/c4',
        'X-Title': 'C4',
      },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Jev returned invalid JSON (HTTP ${response.status})`);
    }
    if (!response.ok) {
      const detail = String(payload?.error?.message ?? payload?.message ?? response.statusText).slice(0, 300);
      throw new Error(`Jev HTTP ${response.status}: ${detail}`);
    }
    if (!payload?.answers || typeof payload.answers !== 'object') {
      throw new Error('Jev response omitted answers');
    }
    for (const [id, question] of Object.entries(questions)) {
      const answer = payload.answers[id];
      if (!answer || answer.type !== question.type) {
        throw new Error(`Jev response omitted or mistyped ${id}`);
      }
      if (question.type === 'noul' && !(answer.noul >= 0 && answer.noul <= 1)) {
        throw new Error(`Jev response has invalid probability for ${id}`);
      }
    }
    return {
      answers: payload.answers,
      model: payload.model ?? JEV_MODEL,
      provider: payload.provider,
      usage: {
        inputTokens: Number(payload.usage?.input_tokens ?? 0),
        outputTokens: Number(payload.usage?.output_tokens ?? 0),
        costUsd: Number(payload.usage?.cost ?? 0),
      },
      latencyMs: performance.now() - started,
    };
  }
}
