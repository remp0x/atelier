/**
 * Pod (usepod.ai) LLM client.
 *
 * Pod is a privacy-preserving, OpenAI-compatible inference proxy on Solana.
 * Atelier uses it as a backend text-intelligence layer (moderation, matching,
 * verification, summarization) -- never for content generation, which is the
 * agents' job.
 *
 * Auth model is a prepaid balance: the access token lives in the URL path and
 * each request is debited from a funded balance. `api_key` is ignored by Pod.
 * Fund the balance via `POST https://api.usepod.ai/v1/register` then top up
 * with USDC on Solana. Configure `POD_TOKEN` once that balance exists.
 *
 * Every helper here is FAIL-OPEN: if Pod is unconfigured, unreachable, slow, or
 * returns garbage, callers receive `null` rather than an exception. Marketplace
 * flows must never break because the inference layer is unavailable.
 */

const POD_PROXY_BASE = process.env.POD_BASE_URL || 'https://api.usepod.ai/proxy';
const POD_TOKEN = process.env.POD_TOKEN;
const POD_DEFAULT_MODEL = process.env.POD_MODEL || 'gpt-4o-mini';
const POD_TIMEOUT_MS = Number(process.env.POD_TIMEOUT_MS || '25000');
const POD_TTS_MODEL = process.env.POD_TTS_MODEL || 'tts-1';
const POD_TTS_VOICE = process.env.POD_TTS_VOICE || 'shimmer';
const POD_TTS_TIMEOUT_MS = Number(process.env.POD_TTS_TIMEOUT_MS || '20000');
// Pod is prepaid (order-book pricing, so spend per call is variable). Warn once
// the balance reported on each response dips under this floor so the token gets
// topped up before LLM features silently fail-open to no-ops.
const POD_MIN_BALANCE = Number(process.env.POD_MIN_BALANCE || '1');

export function isPodConfigured(): boolean {
  return typeof POD_TOKEN === 'string' && POD_TOKEN.length > 0;
}

let lastBalanceRemaining: number | null = null;

/** Last balance reported by Pod via `X-Balance-Remaining`, or null if unknown. */
export function getPodBalanceRemaining(): number | null {
  return lastBalanceRemaining;
}

function recordBalance(header: string | null): void {
  if (header == null) return;
  // Pod can emit multiple X-Balance-Remaining values, which fetch joins with
  // commas; the true remaining balance is the largest non-negative one.
  const values = header
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => !Number.isNaN(n) && n >= 0);
  if (values.length === 0) return;
  const balance = Math.max(...values);
  lastBalanceRemaining = balance;
  if (balance < POD_MIN_BALANCE) {
    console.warn(`Pod balance low: ${balance} remaining (top up the POD_TOKEN balance with USDC on Solana).`);
  }
}

interface PodChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PodChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

interface PodChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

async function podChat(messages: PodChatMessage[], options: PodChatOptions = {}): Promise<string | null> {
  if (!isPodConfigured()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? POD_TIMEOUT_MS);

  try {
    const res = await fetch(`${POD_PROXY_BASE}/${POD_TOKEN}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer placeholder',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model ?? POD_DEFAULT_MODEL,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 512,
      }),
      signal: controller.signal,
    });

    recordBalance(res.headers.get('X-Balance-Remaining'));

    if (!res.ok) {
      console.error(`Pod inference error (${res.status}):`, await res.text().catch(() => ''));
      return null;
    }

    const json = (await res.json()) as PodChatCompletion;
    const content = json.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch (err) {
    console.error('Pod inference request failed:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Synthesize speech via Pod's OpenAI-compatible `/v1/audio/speech` endpoint and
 * return raw audio bytes (mp3), or `null` on any failure (unconfigured, network,
 * non-audio response, timeout). Debits the same prepaid Pod balance as inference.
 */
export async function podSynthesizeSpeech(text: string): Promise<ArrayBuffer | null> {
  if (!isPodConfigured()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POD_TTS_TIMEOUT_MS);

  try {
    const res = await fetch(`${POD_PROXY_BASE}/${POD_TOKEN}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer placeholder',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: POD_TTS_MODEL,
        voice: POD_TTS_VOICE,
        input: text,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });

    recordBalance(res.headers.get('X-Balance-Remaining'));

    if (!res.ok) {
      console.error(`Pod TTS error (${res.status}):`, await res.text().catch(() => ''));
      return null;
    }
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      console.error('Pod TTS returned JSON, not audio:', (await res.text()).slice(0, 200));
      return null;
    }

    return await res.arrayBuffer();
  } catch (err) {
    console.error('Pod TTS request failed:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(start, end + 1);
  }
  return body.trim();
}

/**
 * Run a single system+user prompt and parse the model's reply as JSON.
 * Returns `null` on any failure (unconfigured, network, non-JSON, timeout).
 */
export async function podCompleteJson<T>(
  system: string,
  user: string,
  options: PodChatOptions = {},
): Promise<T | null> {
  const raw = await podChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    options,
  );
  if (!raw) return null;

  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    console.error('Pod returned non-JSON output:', raw.slice(0, 200));
    return null;
  }
}

/**
 * Run a single system+user prompt and return the raw text reply, or `null`.
 */
export async function podCompleteText(
  system: string,
  user: string,
  options: PodChatOptions = {},
): Promise<string | null> {
  return podChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    options,
  );
}
