// Rule-based question rewrite for the intake confirm step. No AI call:
// the value is making the seeker reflect on the question, not producing
// a perfect rewrite. The rules FRAME the original question instead of
// rewriting its grammar, so the suggestion is always grammatical: the
// user's own words are kept intact inside quotes, and the frame turns
// a verdict-seeking question into a reflective one.
//
// Returns null when the question is already open (what/how/why) or
// when no rule matches (statements, fragments). Callers show the
// suggestion only when it differs from the original.

export function suggestQuestionRewrite(question: string): string | null {
  const q = question.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const first = lower.split(/\s+/)[0] ?? "";
  // Already open-ended: what, how, why (including contractions).
  if (/^(what|how|why|what's|how's|why's)\b/.test(lower)) return null;
  if (first === "should") {
    return `What do I need to weigh up before deciding: "${q}"?`;
  }
  if (first === "will" || first === "would") {
    return `What is in my control, and what is not, when it comes to: "${q}"?`;
  }
  // Third-party feeling questions: does/do/did + he/she/they.
  if (/^(does|do|did)\s+(he|she|they|his|her|their)\b/.test(lower)) {
    return `What can I observe, and what could I ask, about: "${q}"?`;
  }
  // Any other yes/no opener.
  if (/^(is|are|was|were|am|do|does|did|can|could|has|have|had)\b/.test(lower)) {
    return `What should I consider about: "${q}"?`;
  }
  return null;
}
