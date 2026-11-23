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

// Batch 1 (S4): the opening sentence of a reading restates the
// seeker's question (the prompt asks for that), so quoting it on a
// public story card repeats a private question. bodySentence() skips
// the opening sentence, headings, questions (the reflection question),
// and closing/disclaimer lines, and quotes the first substantive
// sentence from the BODY of the reading. Still never written or
// invented here: it is a real sentence from the reading text.
const MIN_BODY_WORDS = 6;
const CLOSING_LINE =
  /\b(?:not (?:medical|financial|legal|professional) advice|licensed professional|for reflection (?:and|&) (?:entertainment|perspective)|not a (?:guaranteed )?prediction|helpline|emergency number)\b/i;

/** Every sentence in reading order, headings and list markers dropped. */
export function readingSentences(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw
      .trim()
      .replace(/^(?:[•*-]|\d+\.)\s+/, "")
      .trim();
    // A heading (no sentence-ending punctuation) is not a sentence.
    if (!line || !/[.!?]["'”’)]*$/.test(line)) continue;
    const parts = line.match(/[^.!?]*[.!?]+["'”’)]*(?=\s|$)/g) ?? [line];
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

function capTakeaway(sentence: string): string {
  if (sentence.length <= MAX_TAKEAWAY_CHARS) return sentence;
  return `${sentence.slice(0, MAX_TAKEAWAY_CHARS).trimEnd()}…`;
}

export function bodySentence(text: string | undefined | null): string {
  const sentences = readingSentences(text);
  const candidates = sentences
    .slice(1)
    .filter(
      (s) =>
        !s.endsWith("?") &&
        !CLOSING_LINE.test(s) &&
        s.split(/\s+/).length >= MIN_BODY_WORDS
    );
  if (candidates.length === 0) return firstSentence(text);
  const fits = candidates.find((s) => s.length <= MAX_TAKEAWAY_CHARS);
  return capTakeaway(fits ?? candidates[0]);
}
