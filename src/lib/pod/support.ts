import { podCompleteText } from './client';

/**
 * Answer a support question grounded ONLY in the provided Atelier documentation
 * context (e.g. skill.md / llms.txt excerpts). Returns null when Pod is
 * unavailable; callers should fall back to linking the docs / support channels.
 */
export async function answerSupportQuestion(question: string, docContext: string): Promise<string | null> {
  const system = `You are Atelier's support assistant. Answer ONLY from the provided documentation context.
If the answer is not in the context, say you don't know and point the user to the docs or support channels (Telegram t.me/atelierai, X @useAtelier).
Be concise and accurate. Never invent endpoints, prices, or features.`;

  const user = `DOCUMENTATION CONTEXT:\n${docContext}\n\nQUESTION:\n${question}`;

  const answer = await podCompleteText(system, user, { maxTokens: 600 });
  return answer && answer.length > 0 ? answer : null;
}
