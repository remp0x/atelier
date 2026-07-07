import type { ServiceCategory } from '@/lib/atelier-db';
import { podCompleteJson } from './client';

export type ModerationVerdict = 'ok' | 'review' | 'spam';

export interface ModerationResult {
  verdict: ModerationVerdict;
  reason: string;
}

const SAFE_DEFAULT: ModerationResult = { verdict: 'ok', reason: 'moderation unavailable' };

const VALID_VERDICTS: ModerationVerdict[] = ['ok', 'review', 'spam'];

const VIOLATION_CODES = [
  'scam_phishing',
  'key_solicitation',
  'impersonation',
  'illegal_content',
  'off_platform_payment',
  'sexual_or_violent',
  'gibberish',
  'test_listing',
] as const;

type ViolationCode = (typeof VIOLATION_CODES)[number];

interface RawModerationReply {
  verdict: ModerationVerdict;
  code?: string;
  reason?: string;
}

type ListingKind = 'agent' | 'service' | 'bounty' | 'skill';

// Closed mandate: flag ONLY the enumerated violations. Quality judgments
// (vagueness, viability, ambitious claims) are explicitly out of scope --
// they produced arbitrary flags on legitimate listings. Deterministic rules
// in content-guard.ts handle names, banned words, and banned claims upstream.
const MODERATION_SYSTEM = `You are the trust-and-safety filter for Atelier, a marketplace where AI agents sell services for USDC.
Valid service categories: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom.
Trading signals, crypto analytics, memecoin branding, and token launches are supported platform features -- never flag a listing for being crypto- or token-related.

Flag a listing ONLY when it matches one of these violations:
- scam_phishing: fraud, phishing, malware distribution, or a scheme designed to steal user funds
- key_solicitation: asks users for seed phrases, private keys, or wallet credentials
- impersonation: poses as another brand, project, or person, including "official"/"unofficial" third-party branding
- illegal_content: clearly illegal goods, services, or content
- off_platform_payment: instructs buyers to pay outside Atelier
- sexual_or_violent: sexual services or graphic violence
- gibberish: meaningless or random text that does not describe any service
- test_listing: self-identifies as a test, debug, or placeholder submission

Verdicts:
- "spam": the listing clearly matches a violation. Set "code" to the violation.
- "review": strong signs of a violation but genuine ambiguity remains. Set "code" to the suspected violation.
- "ok": everything else. Omit "code".

Do NOT flag for: vagueness, short text, missing pricing, unverifiable or ambitious claims, business viability, regulatory concerns, service quality, or crypto/memecoin/token content. A vague but harmless listing is "ok".

Respond ONLY with JSON: {"verdict":"ok|review|spam","code":"<violation code, only when flagging>","reason":"<=120 chars"}.`;

/**
 * Classify a free-text listing as ok / review / spam against the enumerated
 * violation list. Flagged results carry a stable violation code prefixed onto
 * the reason ("impersonation: ..."). Fail-open: returns "ok" when Pod is
 * unavailable so listings are never blocked by an outage.
 */
export async function moderateListing(kind: ListingKind, text: string): Promise<ModerationResult> {
  const result = await podCompleteJson<RawModerationReply>(
    MODERATION_SYSTEM,
    `Listing type: ${kind}\n\n${text}`,
  );
  if (!result || !VALID_VERDICTS.includes(result.verdict)) return SAFE_DEFAULT;
  if (result.verdict === 'ok') return { verdict: 'ok', reason: '' };

  // A flag without a recognized violation code is the old failure mode
  // (subjective judgment) leaking back in -- treat it as not actionable.
  const code = VIOLATION_CODES.includes(result.code as ViolationCode) ? (result.code as ViolationCode) : null;
  if (!code) return { verdict: 'ok', reason: '' };

  return { verdict: result.verdict, reason: `${code}: ${result.reason || ''}`.slice(0, 200) };
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
