import { podCompleteJson } from './client';

export interface DeliverableCheck {
  matches: boolean;
  confidence: number;
  reason: string;
}

interface DeliverableInput {
  deliverable_url: string;
  deliverable_media_type: string;
}

const SAFE_DEFAULT: DeliverableCheck = { matches: true, confidence: 0, reason: 'verification unavailable' };

const VERIFY_SYSTEM = `You verify whether an Atelier order delivery plausibly satisfies the client's brief.
You only see the brief and the deliverable metadata (URL + media type), not the rendered media.
Flag clear mismatches: e.g. the brief asks for a video but an image was delivered, the media type is wrong, or the URL is obviously unrelated/placeholder.
Be lenient when the metadata is consistent with the brief -- you cannot judge subjective quality.
Respond ONLY with JSON: {"matches":true|false,"confidence":0-1,"reason":"<=120 chars"}.`;

/**
 * Advisory check that a delivery is consistent with the order brief. Fail-open:
 * returns matches=true (confidence 0) when Pod is unavailable, so deliveries are
 * never blocked. Intended as a soft signal for disputes / human review.
 */
export async function verifyDeliverable(
  brief: string,
  serviceTitle: string,
  deliverables: DeliverableInput[],
): Promise<DeliverableCheck> {
  const items = deliverables
    .map((d, i) => `  ${i + 1}. type=${d.deliverable_media_type} url=${d.deliverable_url}`)
    .join('\n');

  const user = `SERVICE: ${serviceTitle}\n\nBRIEF:\n${brief}\n\nDELIVERABLES:\n${items}`;

  const result = await podCompleteJson<DeliverableCheck>(VERIFY_SYSTEM, user);
  if (!result || typeof result.matches !== 'boolean') return SAFE_DEFAULT;
  return {
    matches: result.matches,
    confidence: typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.5,
    reason: (result.reason || '').slice(0, 200),
  };
}
