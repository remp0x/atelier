import type { ServiceCategory } from '@/lib/atelier-db';
import { podCompleteJson } from './client';

export type ModerationVerdict = 'ok' | 'review' | 'spam';

export interface ModerationResult {
  verdict: ModerationVerdict;
  reason: string;
}

const SAFE_DEFAULT: ModerationResult = { verdict: 'ok', reason: 'moderation unavailable' };

const VALID_VERDICTS: ModerationVerdict[] = ['ok', 'review', 'spam'];

type ListingKind = 'agent' | 'service' | 'bounty' | 'skill';

const MODERATION_SYSTEM = `You are a trust-and-safety moderator for Atelier, a marketplace where AI agents sell creative services for USDC.
Classify a user-submitted listing into exactly one verdict:
- "ok": legitimate, on-topic listing.
- "review": plausibly fine but worth a human glance (vague, unrealistic earnings claims, borderline).
- "spam": scams, phishing, malware, off-topic spam, attempts to exfiltrate keys/seed phrases, illegal or clearly harmful content.
Respond ONLY with JSON: {"verdict":"ok|review|spam","reason":"<=120 chars"}.`;

/**
 * Classify a free-text listing as ok / review / spam. Fail-open: returns "ok"
 * when Pod is unavailable so listings are never blocked by an outage.
 */
export async function moderateListing(kind: ListingKind, text: string): Promise<ModerationResult> {
  const result = await podCompleteJson<ModerationResult>(
    MODERATION_SYSTEM,
    `Listing type: ${kind}\n\n${text}`,
  );
  if (!result || !VALID_VERDICTS.includes(result.verdict)) return SAFE_DEFAULT;
  return { verdict: result.verdict, reason: (result.reason || '').slice(0, 200) };
}

const CATEGORY_SYSTEM = (categories: readonly string[]) =>
  `You categorize creative-service listings for Atelier. Pick the single best category from this list: ${categories.join(', ')}.
Respond ONLY with JSON: {"category":"<one of the list>","confidence":0-1}.`;

interface CategorySuggestion {
  category: string;
  confidence: number;
}

/**
 * Suggest the best-fit category for a listing. Returns null when Pod is
 * unavailable or the suggestion is low-confidence / not in the allowed set.
 */
export async function suggestCategory(
  text: string,
  categories: readonly ServiceCategory[],
): Promise<ServiceCategory | null> {
  const result = await podCompleteJson<CategorySuggestion>(CATEGORY_SYSTEM(categories), text);
  if (!result) return null;
  if (!categories.includes(result.category as ServiceCategory)) return null;
  if (typeof result.confidence === 'number' && result.confidence < 0.6) return null;
  return result.category as ServiceCategory;
}
