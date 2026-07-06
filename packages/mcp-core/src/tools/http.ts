import type { ToolContext } from '../context';

export interface FetchOutcome {
  status: number;
  ok: boolean;
  body: unknown;
}

export async function fetchJson(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<FetchOutcome> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (kept as raw text)
  }
  return { status: res.status, ok: res.ok, body };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Authorization header carrying the caller's own atelier_ key, when present. */
export function authHeaders(ctx: ToolContext): Record<string, string> {
  return ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {};
}

/** Unwrap the `{ success, data, error }` envelope the REST routes return. */
export function unwrap(outcome: FetchOutcome): unknown {
  if (isRecord(outcome.body)) {
    if (outcome.body.success === false) {
      throw new Error(typeof outcome.body.error === 'string' ? outcome.body.error : `HTTP ${outcome.status}`);
    }
    if ('data' in outcome.body) return outcome.body.data;
  }
  return outcome.body;
}
