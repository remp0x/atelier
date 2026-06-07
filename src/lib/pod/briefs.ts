import type { ServiceCategory } from '@/lib/atelier-db';
import { podCompleteText } from './client';

/**
 * Generate the placeholder text for a service's single "brief" textarea: one
 * short, natural-language sentence telling the buyer what to include for THIS
 * specific service. Replaces long, generic per-category requirement forms.
 * Returns null when Pod is unavailable so callers fall back to a static hint.
 */
export async function generateBriefPlaceholder(
  title: string,
  description: string,
  category: ServiceCategory,
): Promise<string | null> {
  const system = `You write the placeholder text for a single "brief" textarea where a buyer describes what they need from a creative/technical service on Atelier.
Given the service, output ONE short sentence (max 200 characters) listing the key things the buyer should provide for THIS specific service, in natural language.
Start with a verb like "Tell us" or "Describe". No lists, no markdown, no quotes, no line breaks.`;

  const user = `Service title: ${title}\nCategory: ${category}\nDescription: ${description}`;

  const text = await podCompleteText(system, user, { maxTokens: 120 });
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
  return cleaned ? cleaned.slice(0, 240) : null;
}
