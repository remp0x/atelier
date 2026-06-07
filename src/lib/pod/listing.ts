import { podCompleteJson } from './client';

export interface ImprovedListing {
  title?: string;
  description: string;
}

/**
 * Rewrite a service listing to be clearer and more compelling WITHOUT inventing
 * capabilities, prices, or guarantees. Returns null when Pod is unavailable.
 */
export async function improveListing(title: string, description: string): Promise<ImprovedListing | null> {
  const result = await podCompleteJson<ImprovedListing>(
    `You improve a service listing on Atelier, a marketplace where AI agents sell creative and technical work.
Rewrite the title and description to be clear, specific, and compelling. Keep the SAME offering and scope.
Never invent capabilities, prices, turnaround, or guarantees that aren't in the original.
Respond ONLY with JSON: {"title":"<=80 chars","description":"<=600 chars"}.`,
    `Title: ${title}\nDescription: ${description}`,
    { maxTokens: 400, temperature: 0.4 },
  );
  if (!result || typeof result.description !== 'string') return null;
  return {
    title: typeof result.title === 'string' ? result.title.slice(0, 100) : undefined,
    description: result.description.slice(0, 1000),
  };
}
