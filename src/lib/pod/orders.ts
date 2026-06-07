import { podCompleteJson } from './client';

export interface BriefSpec {
  summary: string;
  deliverables: string[];
  requirements: string[];
  missing: string[];
}

/**
 * Convert a buyer's free-text brief into a clean structured spec the fulfilling
 * agent can act on. Only restructures what's there; flags missing info. Null on
 * failure.
 */
export async function briefToSpec(serviceTitle: string, brief: string): Promise<BriefSpec | null> {
  const result = await podCompleteJson<BriefSpec>(
    `You convert a buyer's free-text brief for an Atelier service into a clean structured spec the fulfilling AI agent can act on.
Do NOT invent details. Only restructure what the buyer actually wrote. List what they did NOT provide but the agent will likely need under "missing".
Respond ONLY with JSON: {"summary":"one line","deliverables":["..."],"requirements":["..."],"missing":["..."]}.`,
    `Service: ${serviceTitle}\n\nBrief:\n${brief}`,
    { maxTokens: 500 },
  );
  if (!result || typeof result.summary !== 'string') return null;
  return {
    summary: result.summary.slice(0, 300),
    deliverables: Array.isArray(result.deliverables) ? result.deliverables.slice(0, 10) : [],
    requirements: Array.isArray(result.requirements) ? result.requirements.slice(0, 10) : [],
    missing: Array.isArray(result.missing) ? result.missing.slice(0, 8) : [],
  };
}

export interface BriefCompleteness {
  complete: boolean;
  missing: string[];
}

/**
 * Lightweight pre-submit check: does the brief give the agent enough to start?
 * Returns the (short) list of important things the buyer likely forgot. Null on
 * failure so the UI can simply let the order through.
 */
export async function checkBriefCompleteness(
  serviceTitle: string,
  serviceDescription: string,
  brief: string,
): Promise<BriefCompleteness | null> {
  const result = await podCompleteJson<BriefCompleteness>(
    `You check whether a buyer's brief gives an Atelier agent enough to start the work. Be lenient: only flag genuinely important missing info, max 3 items, phrased as short friendly nudges. If it's good enough, complete=true and missing=[].
Respond ONLY with JSON: {"complete":true|false,"missing":["short nudge",...]}.`,
    `Service: ${serviceTitle}\nWhat it offers: ${serviceDescription}\n\nBuyer's brief:\n${brief}`,
    { maxTokens: 250 },
  );
  if (!result || typeof result.complete !== 'boolean') return null;
  return {
    complete: result.complete,
    missing: Array.isArray(result.missing) ? result.missing.slice(0, 3) : [],
  };
}

export interface BriefTranslation {
  language: string;
  english: string;
}

/**
 * Detect the brief's language and return an English version for the agent.
 * Returns the original if already English. Null on failure.
 */
export async function translateBriefToEnglish(brief: string): Promise<BriefTranslation | null> {
  const result = await podCompleteJson<BriefTranslation>(
    `You detect the language of a buyer's brief and translate it to natural English for the fulfilling agent. If it's already English, return it unchanged. Preserve all concrete details, names, and URLs.
Respond ONLY with JSON: {"language":"<ISO 639-1 code>","english":"<translation>"}.`,
    brief,
    { maxTokens: 700 },
  );
  if (!result || typeof result.english !== 'string') return null;
  return { language: (result.language || 'en').slice(0, 8), english: result.english.slice(0, 2000) };
}
