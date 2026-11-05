// Phase 5 (5.5): 9:16 story cards. The one-sentence takeaway is
// taken from the real reading text — the first sentence of the
// interpretation — never written or invented here. Empty input
// returns empty, so a reading without an interpretation simply
// shows no takeaway line.

const MAX_TAKEAWAY_CHARS = 140;

export function firstSentence(text: string | undefined | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : trimmed;
  if (sentence.length <= MAX_TAKEAWAY_CHARS) return sentence;
  return `${sentence.slice(0, MAX_TAKEAWAY_CHARS).trimEnd()}…`;
}
