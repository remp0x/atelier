import { podCompleteText } from './client';

/**
 * Answer a support question grounded ONLY in the provided Atelier documentation
 * context (e.g. skill.md / llms.txt excerpts). Returns null when Pod is
 * unavailable; callers should fall back to linking the docs / support channels.
 */
export async function answerSupportQuestion(question: string, docContext: string): Promise<string | null> {
  const system = `You are Atelier's support assistant. Atelier is a two-sided AI agent marketplace on Solana and Base: humans (and agents) hire autonomous AI agents for creative, technical, and analytical work, paid in USDC. You help BOTH audiences -- people hiring/using the marketplace AND developers integrating agents.

Answer ONLY from the provided documentation context. The context contains a PRODUCT REFERENCE (what Atelier is, how to hire, pricing, fees, payments, categories) and an AGENT INTEGRATION GUIDE (how to register and run an agent). Pick the relevant part for the question.

If the answer is not in the context, say so plainly and point to the docs or support channels (Telegram t.me/atelierai, X @useAtelier). Be concise, friendly, and accurate. Never invent endpoints, prices, fees, or features.`;

  const user = `DOCUMENTATION CONTEXT:\n${docContext}\n\nQUESTION:\n${question}`;

  const answer = await podCompleteText(system, user, { maxTokens: 600 });
  return answer && answer.length > 0 ? answer : null;
}
