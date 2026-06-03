/**
 * Retrieval layer for the Ask-Atelier support assistant.
 *
 * Chunks Atelier's public docs (llms-full.txt = product reference, skill.md =
 * agent integration), embeds them with OpenAI `text-embedding-3-small`, and
 * retrieves the top-K most relevant chunks for a question via cosine similarity.
 * The retrieved chunks are what gets fed to the generation model (Pod), so the
 * assistant is grounded in only the passages that actually matter to the query.
 *
 * The index is built lazily and cached in memory with a TTL (the corpus is
 * small and llms-full.txt carries live stats, so periodic rebuilds keep it
 * fresh). Every function is fail-open: callers get `null` on any failure and
 * fall back to whole-document grounding.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = process.env.SUPPORT_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIM = 1536;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';
const INDEX_TTL_MS = 30 * 60 * 1000;
const MAX_CHUNK_CHARS = 1100;
const DEFAULT_TOP_K = 12;

const DOC_SOURCES: Array<{ label: string; path: string }> = [
  { label: 'ATELIER PRODUCT REFERENCE', path: '/llms-full.txt' },
  { label: 'AGENT INTEGRATION GUIDE', path: '/skill.md' },
];

interface Chunk {
  source: string;
  content: string;
  embedding: number[];
}

let indexCache: { chunks: Chunk[]; at: number } | null = null;
let buildInFlight: Promise<Chunk[] | null> | null = null;

export function isSupportRagEnabled(): boolean {
  return typeof GEMINI_API_KEY === 'string' && GEMINI_API_KEY.length > 0;
}

async function embed(texts: string[]): Promise<number[][] | null> {
  if (!isSupportRagEnabled() || texts.length === 0) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-api-key': GEMINI_API_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIM,
          })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.error(`Embedding error (${res.status}):`, await res.text().catch(() => ''));
        return null;
      }
      const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
      if (!json.embeddings || json.embeddings.length !== batch.length) return null;
      for (const e of json.embeddings) out.push(e.values);
    } catch (err) {
      console.error('Embedding request failed:', err);
      return null;
    }
  }
  return out;
}

function chunkDoc(source: string, text: string): Array<{ source: string; content: string }> {
  const chunks: Array<{ source: string; content: string }> = [];
  let heading = '';
  let buf: string[] = [];
  let len = 0;

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) chunks.push({ source, content: heading ? `${heading}\n${body}` : body });
    buf = [];
    len = 0;
  };

  for (const line of text.split('\n')) {
    if (/^#{1,4}\s/.test(line)) {
      flush();
      heading = line.replace(/^#{1,4}\s/, '').trim();
      continue;
    }
    if (len + line.length + 1 > MAX_CHUNK_CHARS && len > 0) flush();
    buf.push(line);
    len += line.length + 1;
  }
  flush();
  return chunks;
}

async function fetchDoc(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function buildIndex(): Promise<Chunk[] | null> {
  const raw: Array<{ source: string; content: string }> = [];
  for (const { label, path } of DOC_SOURCES) {
    const text = await fetchDoc(path);
    if (text) raw.push(...chunkDoc(label, text));
  }
  if (raw.length === 0) return null;

  const embeddings = await embed(raw.map((c) => c.content));
  if (!embeddings || embeddings.length !== raw.length) return null;

  return raw.map((c, i) => ({ source: c.source, content: c.content, embedding: embeddings[i] }));
}

async function getIndex(): Promise<Chunk[] | null> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.chunks;
  if (buildInFlight) return buildInFlight;

  buildInFlight = buildIndex()
    .then((chunks) => {
      if (chunks) indexCache = { chunks, at: Date.now() };
      return chunks ?? indexCache?.chunks ?? null;
    })
    .finally(() => {
      buildInFlight = null;
    });

  return buildInFlight;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieve the top-K doc chunks most relevant to `query`, formatted as a context
 * string. Returns null when retrieval is unavailable (no key, embed failure,
 * empty index) so the caller can fall back to whole-document grounding.
 */
export async function retrieveContext(query: string, k: number = DEFAULT_TOP_K): Promise<string | null> {
  const chunks = await getIndex();
  if (!chunks || chunks.length === 0) return null;

  const queryEmbedding = await embed([query]);
  if (!queryEmbedding || queryEmbedding.length === 0) return null;

  const scored = chunks
    .map((c) => ({ c, score: cosine(queryEmbedding[0], c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored.map((s) => `=== ${s.c.source} ===\n${s.c.content}`).join('\n\n');
}
