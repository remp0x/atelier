export type ExpressionName = 'neutral' | 'happy' | 'thinking' | 'apologetic' | 'surprised';

const HAPPY = /\b(yes|great|awesome|sure|happy to|glad|done|success|congrats|welcome|enjoy|nice|perfect|absolutely)\b/i;
const APOLOGETIC = /\b(sorry|unfortunately|unable|can'?t|cannot|isn'?t|aren'?t|don'?t|not (?:possible|available|supported)|no longer|failed|error)\b/i;
const SURPRISED = /\b(wow|whoa|amazing|incredible|huge|massive|surprising|really\?|wait[,.])\b/i;
const THINKING = /\b(hmm|let me|depends|it varies|generally|typically|in most cases|consider)\b/i;

export function emotionFromText(text: string): ExpressionName {
  const head = text.slice(0, 240);
  if (APOLOGETIC.test(head)) return 'apologetic';
  if (SURPRISED.test(head)) return 'surprised';
  if (HAPPY.test(head)) return 'happy';
  if (THINKING.test(head) || head.trimEnd().endsWith('?')) return 'thinking';
  return 'neutral';
}
