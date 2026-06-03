/**
 * Retrieval layer for the Ask-Atelier support assistant.
 *
 * Chunks Atelier's public docs (llms-full.txt = product reference, skill.md =
 * agent integration) and retrieves the top-K chunks most relevant to a question
 * using BM25 lexical ranking. Only those chunks are fed to the generation model
 * (Pod), so the assistant is grounded in the passages that actually matter.
 *
 * Retrieval is in-process (no embedding/vector provider) -- Pod is the only
 * external dependency, and it only does generation. The index is built lazily
 * and cached in memory with a TTL (the corpus is small and llms-full.txt carries
 * live stats, so periodic rebuilds keep it fresh). Fail-open: callers get `null`
 * on any failure and fall back to whole-document grounding.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://atelierai.xyz';
const INDEX_TTL_MS = 30 * 60 * 1000;
const MAX_CHUNK_CHARS = 1100;
const DEFAULT_TOP_K = 12;

const BM25_K1 = 1.5;
const BM25_B = 0.75;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'be', 'do', 'does', 'how', 'what', 'why', 'when', 'where', 'can', 'i', 'you', 'my', 'your',
  'it', 'its', 'this', 'that', 'as', 'at', 'by', 'from', 'me', 'we', 'they', 'them', 'their',
]);

const DOC_SOURCES: Array<{ label: string; path: string }> = [
  { label: 'ATELIER PRODUCT REFERENCE', path: '/llms-full.txt' },
  { label: 'AGENT INTEGRATION GUIDE', path: '/skill.md' },
];

interface Chunk {
  source: string;
  content: string;
  tokens: string[];
  termFreq: Map<string, number>;
}

interface Index {
  chunks: Chunk[];
  df: Map<string, number>;
  avgDocLength: number;
}

let indexCache: { index: Index; at: number } | null = null;
let buildInFlight: Promise<Index | null> | null = null;

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!matches) return [];
  return matches.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
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

async function buildIndex(): Promise<Index | null> {
  const raw: Array<{ source: string; content: string }> = [];
  for (const { label, path } of DOC_SOURCES) {
    const text = await fetchDoc(path);
    if (text) raw.push(...chunkDoc(label, text));
  }
  if (raw.length === 0) return null;

  const df = new Map<string, number>();
  let totalLength = 0;

  const chunks: Chunk[] = raw.map(({ source, content }) => {
    const tokens = tokenize(content);
    const termFreq = new Map<string, number>();
    for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    termFreq.forEach((_count, t) => df.set(t, (df.get(t) ?? 0) + 1));
    totalLength += tokens.length;
    return { source, content, tokens, termFreq };
  });

  return { chunks, df, avgDocLength: totalLength / chunks.length };
}

async function getIndex(): Promise<Index | null> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  if (buildInFlight) return buildInFlight;

  buildInFlight = buildIndex()
    .then((index) => {
      if (index) indexCache = { index, at: Date.now() };
      return index ?? indexCache?.index ?? null;
    })
    .finally(() => {
      buildInFlight = null;
    });

  return buildInFlight;
}

function scoreChunk(queryTerms: string[], chunk: Chunk, index: Index): number {
  const N = index.chunks.length;
  const dl = chunk.tokens.length;
  let score = 0;
  for (const term of queryTerms) {
    const tf = chunk.termFreq.get(term);
    if (!tf) continue;
    const df = index.df.get(term) ?? 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const norm = tf * (BM25_K1 + 1);
    const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / index.avgDocLength);
    score += idf * (norm / denom);
  }
  return score;
}

/**
 * Retrieve the top-K doc chunks most relevant to `query`, formatted as a context
 * string. Returns null when the index can't be built (docs unreachable) so the
 * caller can fall back to whole-document grounding.
 */
export async function retrieveContext(query: string, k: number = DEFAULT_TOP_K): Promise<string | null> {
  const index = await getIndex();
  if (!index || index.chunks.length === 0) return null;

  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0) return null;

  const scored = index.chunks
    .map((c) => ({ c, score: scoreChunk(queryTerms, c, index) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  if (scored.length === 0) return null;

  return scored.map((s) => `=== ${s.c.source} ===\n${s.c.content}`).join('\n\n');
}
