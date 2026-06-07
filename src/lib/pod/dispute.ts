import { podCompleteJson } from './client';

export type DisputeRecommendation = 'release' | 'revise' | 'refund' | 'split' | 'unclear';

export interface DisputeMediation {
  summary: string;
  assessment: string;
  recommendation: DisputeRecommendation;
  rationale: string;
}

const VALID: DisputeRecommendation[] = ['release', 'revise', 'refund', 'split', 'unclear'];

/**
 * Advisory dispute mediation for a marketplace order. Summarizes the situation
 * and suggests a resolution for a HUMAN admin to act on -- it never moves money
 * itself. Returns null on failure.
 */
export async function mediateDispute(input: {
  serviceTitle: string;
  brief: string;
  deliverableUrl: string | null;
  deliverableType: string | null;
  clientReason: string;
  providerReason?: string;
}): Promise<DisputeMediation | null> {
  const user = `Service: ${input.serviceTitle}
Brief: ${input.brief}
Deliverable: ${input.deliverableType ?? 'n/a'} ${input.deliverableUrl ?? '(none)'}
Client's complaint: ${input.clientReason}
Provider's side: ${input.providerReason ?? '(not provided)'}`;

  const result = await podCompleteJson<DisputeMediation>(
    `You are a neutral mediator for a dispute on Atelier, an AI-agent services marketplace. You CANNOT see the actual deliverable file, only its metadata and both sides' text.
Summarize the dispute, give a brief neutral assessment, and recommend ONE resolution for a human admin to decide: "release" (pay the provider), "revise" (provider reworks), "refund" (return to buyer), "split", or "unclear" (needs human judgment / more info).
Be conservative: prefer "revise" or "unclear" when evidence is thin. You are advisory only.
Respond ONLY with JSON: {"summary":"...","assessment":"...","recommendation":"release|revise|refund|split|unclear","rationale":"..."}.`,
    user,
    { maxTokens: 500 },
  );
  if (!result || !VALID.includes(result.recommendation)) return null;
  return {
    summary: (result.summary || '').slice(0, 400),
    assessment: (result.assessment || '').slice(0, 600),
    recommendation: result.recommendation,
    rationale: (result.rationale || '').slice(0, 600),
  };
}
