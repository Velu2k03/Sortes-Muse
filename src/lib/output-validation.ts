// Output validation for AI-generated text (Phase E, item 1).
// One shared pattern for the four AI routes: a validator is a pure
// function over the generated text plus the grounding the prompt was
// built from. generateChat calls it after each model and tries the
// next model when it fails; when every model fails the route fails
// honestly with no spend. Validation runs on the generated output
// AFTER generation, never before the spend decision, and never
// changes what the model is asked for.
//
// Word bands, decided with reasoning: every prompt asks for 350-550
// words (year-ahead reports 500-700). The validator accepts the
// prompted band plus a 50-word tolerance for natural variation
// (300-600, year-ahead 450-750). A strict 350-550 would discard good
// readings a few words over and turn them into honest 503s; the old
// 100-1200 band would accept thin filler as a paid reading. The
// prompted band sits inside the acceptance band, so prompt and
// validator agree. The grounding checks (card names, question words,
// named placements) do the real anti-filler work, not the band.
//
// Guardrail sentences are deliberately NOT checked here: the routes
// append the health/finances closing server-side after generation,
// so the delivered text always carries it even when the model omits
// it. What the validator checks is the model-controlled part.

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const QUESTION_STOPWORDS = new Set([
  "what", "when", "where", "which", "whose", "should", "could", "would",
  "about", "there", "their", "these", "those", "with", "from", "into",
  "your", "yours", "this", "that", "have", "been", "will", "shall",
  "does", "doing", "done", "make", "take", "want", "need", "know",
  "feel", "think", "going", "after", "before", "between", "through",
]);

/** Content words from a question: 4+ letters, lowercased, stopwords
 *  removed, deduplicated in first-appearance order. A question with
 *  no content words (for example "Why?") yields an empty list, and
 *  callers treat that as a vacuous pass. */
export function significantWords(question: string): string[] {
  const seen = new Set<string>();
  for (const raw of question.toLowerCase().split(/[^a-z\u00c0-\u024f]+/)) {
    if (raw.length < 4 || QUESTION_STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

export interface ReadingValidationInput {
  cards: Array<{ name: string }>;
  question: string;
}

/** Tarot reading: prompted 350-550 words, accepted 300-600. */
export const READING_WORD_BAND = { min: 300, max: 600 } as const;

export function validateReadingText(
  text: string,
  input: ReadingValidationInput
): boolean {
  const words = countWords(text);
  if (words < READING_WORD_BAND.min || words > READING_WORD_BAND.max) return false;
  const lower = text.toLowerCase();
  // At least half the drawn cards must be named, as before.
  const mentioned = input.cards.filter((c) => lower.includes(c.name.toLowerCase())).length;
  if (mentioned < Math.ceil(input.cards.length / 2)) return false;
  // At least one content word from the question, so a reading that
  // never touches the ask fails even when it names the cards.
  const keyWords = significantWords(input.question);
  if (keyWords.length > 0 && !keyWords.some((w) => lower.includes(w))) return false;
  // The prompt requires exactly one reflection question and one
  // practical step. Both are cheap heuristics, not semantic proof:
  // a question mark and the word "step" catch their absence, which
  // is the failure mode that matters here.
  if (!text.includes("?")) return false;
  if (!/\bstep\b/i.test(text)) return false;
  return true;
}

export interface FollowUpValidationInput {
  cardNames: string[];
  clarifierName: string | null;
}

/** Follow-up answer: the 20-800 word band is unchanged. Word count
 *  alone never proved grounding, so the answer must also name at
 *  least one card from the original reading or the clarifier drawn
 *  for this follow-up. */
export function validateFollowUpText(text: string, input: FollowUpValidationInput): boolean {
  const words = countWords(text);
  if (words < 20 || words > 800) return false;
  const lower = text.toLowerCase();
  const names = [...input.cardNames, ...(input.clarifierName ? [input.clarifierName] : [])];
  return names.some((n) => lower.includes(n.toLowerCase()));
}

// Vocabulary the anchor extractor recognises inside chart/report
// prompt lines: planets, zodiac signs, Ziwei palace names, months,
// and ISO dates or years. Anything else in the lines is ignored.
const ANCHOR_VOCABULARY = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu",
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio",
  "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  "Life", "Parents", "Happiness", "Wealth", "Children", "Health", "Spouse",
  "Travel", "Friends", "Career", "Home", "Siblings",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
];

/** Terms from prompt lines that a grounded interpretation should
 *  name back: planets, signs, palaces, months, and dates present in
 *  the lines. Dates are matched as YYYY-MM-DD or a bare year. */
export function anchorTerms(lines: string): string[] {
  const found: string[] = [];
  for (const term of ANCHOR_VOCABULARY) {
    if (lines.includes(term)) found.push(term);
  }
  for (const m of lines.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) found.push(m[0]);
  for (const m of lines.matchAll(/\b(19|20)\d{2}\b/g)) {
    if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

export interface GroundedTextInput {
  anchors: string[];
  minWords?: number;
  maxWords?: number;
}

/** Chart interpretation: prompted 350-550 words, accepted 300-600.
 *  The text must name at least two anchors from the chart lines and
 *  close with a question, as the prompt requires. */
export function validateChartText(text: string, input: GroundedTextInput): boolean {
  const min = input.minWords ?? 300;
  const max = input.maxWords ?? 600;
  const words = countWords(text);
  if (words < min || words > max) return false;
  const lower = text.toLowerCase();
  const named = input.anchors.filter((a) => lower.includes(a.toLowerCase())).length;
  if (named < 2) return false;
  if (!text.includes("?")) return false;
  return true;
}

/** Report: same shape as the chart validator, with the per-type band
 *  (transit and comparison 300-600, year-ahead 450-750). */
export function validateReportText(text: string, input: GroundedTextInput): boolean {
  return validateChartText(text, input);
}
