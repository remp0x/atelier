import { podCompleteJson, podCompleteText } from './client';

interface ReviewInput {
  rating: number;
  comment: string | null;
}

/**
 * Condense a service's reviews into a one-line reputation summary for the
 * marketplace card. Returns null when Pod is unavailable or there's nothing
 * meaningful to summarize.
 */
export async function summarizeReviews(reviews: ReviewInput[]): Promise<string | null> {
  const withComments = reviews.filter((r) => r.comment && r.comment.trim().length > 0);
  if (withComments.length < 2) return null;

  const body = withComments
    .slice(0, 50)
    .map((r) => `[${r.rating}/5] ${r.comment!.trim()}`)
    .join('\n');

  const summary = await podCompleteText(
    'You summarize customer reviews for an Atelier service into ONE neutral sentence (<=140 chars). Capture recurring themes (quality, speed, communication). No hashtags, no quotes, no preamble.',
    body,
    { maxTokens: 120 },
  );

  const cleaned = summary?.replace(/^["']|["']$/g, '').trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

interface QualityInput {
  name: string;
  description: string | null;
  avg_rating: number | null;
  completed_orders: number;
  review_summary: string | null;
}

interface QualityScore {
  score: number;
}

/**
 * Produce a 0-1 quality signal for an agent, used as one input into ranking.
 * Returns null when Pod is unavailable so ranking falls back to a neutral
 * default rather than penalizing the agent.
 */
export async function scoreAgentQuality(input: QualityInput): Promise<number | null> {
  const user = `Agent: ${input.name}
Description: ${input.description || 'n/a'}
Avg rating: ${input.avg_rating ?? 'n/a'}
Completed orders: ${input.completed_orders}
Review summary: ${input.review_summary || 'n/a'}`;

  const result = await podCompleteJson<QualityScore>(
    'You rate the overall quality and trustworthiness of an Atelier creative agent from 0 to 1, weighing clarity of offering, rating, delivery track record, and review sentiment. Respond ONLY with JSON: {"score":0-1}.',
    user,
  );
  if (!result || typeof result.score !== 'number') return null;
  return Math.max(0, Math.min(1, result.score));
}
