// Batch 1 safety (S1, S2): deterministic, server-side text checks
// that run BEFORE any model call, spend, or free-reading use. Phrase
// lists only, never single words: "the Death card", "kill my
// presentation", "dead tired", "the Tower" must never trigger.
//
// Tier A: explicit self-harm or suicide language. No reading is
// generated; the caller gets the support panel only.
// Tier B: hopelessness / giving-up language. The reading is
// generated, with the support panel shown ABOVE it and sharing hidden.

import { INTAKE_CATEGORIES } from "@/lib/intake";

export type SupportTier = "A" | "B";

// Closing sentences enforced server-side (generate + follow-up).
export const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";
export const FINANCES_CLOSE =
  "This reflection is not financial advice. Please speak with a licensed professional about any financial decision.";

/** Appends each closing the text does not already contain, in order. */
export function appendClosings(text: string, closings: string[]): { text: string; appended: string } {
  let appended = "";
  for (const close of closings) {
    if (!text.includes(close) && !appended.includes(close)) appended += `\n\n${close}`;
  }
  return { text: `${text}${appended}`, appended };
}

export const HELPLINE_URL = "https://findahelpline.com";
export const EMERGENCY_LINE = "If you are in immediate danger, please call your local emergency number.";
export const NO_CREDITS_LINE = "No credits were spent.";

export interface SupportPanel {
  tier: SupportTier;
  title: string;
  message: string;
  /** Tier B only: one gentle line inviting the person to reach out. */
  prompt?: string;
  helplineUrl: string;
  helplineLabel: string;
  emergencyLine: string;
  /** Tier A only: nothing was generated or charged. A Tier B reading
      was generated (and may have been paid for), so it never says this. */
  noCreditsLine?: string;
}

/** Lowercase, straighten quotes, collapse whitespace. */
export function normalizeForSafety(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// "don't" / "dont" / "do not"
const DONT = "(?:don'?t|do not)";
const IM = "(?:i'?m|i am)";

const TIER_A_PATTERNS: RegExp[] = [
  /\bkill(?:ing)? myself\b/,
  /\bend(?:ing)? (?:my|my own) life\b/,
  /\btak(?:e|ing) my (?:own )?life\b/,
  /\bend(?:ing)? it all\b/,
  new RegExp(`\\b${DONT} want to (?:live|be alive|exist|wake up)\\b`),
  /\bno (?:longer )?want to (?:live|be alive)\b/,
  /\b(?:want|wanna|going) to die\b(?!\s+(?:my|the|her|his|their|our|it)\b)/,
  /\bwanna die\b(?!\s+(?:my|the|her|his|their|our|it)\b)/,
  /\bwish i (?:was|were) dead\b/,
  /\b(?:be|is|are) better off (?:dead|without me)\b/,
  /\bno reason to (?:live|keep living|go on)\b/,
  /\blife (?:is|isn'?t) (?:not )?worth living\b/,
  new RegExp(`\\b(?:${IM}|feel(?:ing)?|been) suicidal\\b`),
  /\bsuicidal (?:thoughts|feelings)\b/,
  /\b(?:thinking|thought|thoughts) (?:about|of) (?:suicide|killing myself|ending (?:my|it))\b/,
  /\b(?:considering|contemplating|planning|commit(?:ting)?|attempt(?:ing)?) suicide\b/,
  /\b(?:hurt|harm|cut)(?:ing)? myself\b/,
  /\bself[- ]?harm(?:ing)?\b/,
];

const TIER_B_PATTERNS: RegExp[] = [
  /\bfeel(?:ing)? like giving up\b/,
  /\b(?:want|wanna) to give up on (?:life|everything|myself)\b/,
  /\bgiv(?:e|ing) up on (?:life|everything|myself)\b/,
  /\bnothing (?:feels|is|seems) worth it\b/,
  /\bnothing matters (?:any ?more|now)\b/,
  /\bfeel(?:ing|s)? (?:so |completely |totally )?hopeless\b/,
  new RegExp(`\\b${IM} hopeless\\b`),
  /\b(?:no|lost all|losing all) hope\b/,
  /\bcan'?(?:t|not) go on\b/,
  /\bcannot go on\b/,
  /\bcan'?t (?:do this|take (?:it|this)) any ?more\b/,
  /\b(?:what'?s|what is) the point of (?:anything|living|life|it all)\b/,
  /\bno point (?:in )?(?:anything|living|any ?more)\b/,
  /\bfeel(?:ing)? (?:so |completely )?worthless\b/,
];

/**
 * Deterministic crisis tier for the given texts (question, story,
 * follow-up, ...). Tier A wins over Tier B. Null means no tier.
 */
export function detectSupportTier(...texts: Array<string | null | undefined>): SupportTier | null {
  const text = normalizeForSafety(texts.filter((t): t is string => typeof t === "string").join(" \n "));
  if (!text) return null;
  if (TIER_A_PATTERNS.some((re) => re.test(text))) return "A";
  if (TIER_B_PATTERNS.some((re) => re.test(text))) return "B";
  return null;
}

export function supportPanel(tier: SupportTier): SupportPanel {
  if (tier === "A") {
    return {
      tier,
      title: "You do not have to carry this alone",
      message:
        "It sounds like you are going through something really painful right now. You deserve support from a real person today. Please reach out to someone you trust, or talk to a trained listener at a free, confidential helpline. We have not created a reading for this question.",
      helplineUrl: HELPLINE_URL,
      helplineLabel: "Find a helpline near you (findahelpline.com)",
      emergencyLine: EMERGENCY_LINE,
      noCreditsLine: NO_CREDITS_LINE,
    };
  }
  return {
    tier,
    title: "Before your reading",
    message:
      "It sounds like things feel heavy right now. That matters more than any card.",
    prompt:
      "If it would help, please reach out to someone you trust or a free, confidential helpline.",
    helplineUrl: HELPLINE_URL,
    helplineLabel: "Find a helpline near you (findahelpline.com)",
    emergencyLine: EMERGENCY_LINE,
  };
}

// S2: health closing by content. Phrases, not single loose words:
// "cancer" is left out on purpose (it is a zodiac sign here), and
// "sick" is left out ("sick of my job").
const HEALTH_PATTERNS: RegExp[] = [
  /\bdiagnos(?:ed|is|es)\b/,
  /\bserious(?:ly)? ill(?:ness)?\b/,
  /\b(?:chronic|terminal) (?:illness|pain|condition)\b/,
  /\bpregnan(?:t|cy)\b/,
  /\bmiscarriage\b/,
  /\bin (?:the )?hospital\b/,
  /\bhospitali[sz]ed\b/,
  /\b(?:my|our|the|a|her|his) doctors?\b/,
  /\bsymptoms?\b/,
  /\bmedications?\b/,
  /\bprescri(?:bed|ption)\b/,
  /\bsurgery\b/,
  /\bchemo(?:therapy)?\b/,
  /\bbiopsy\b/,
  /\bmedical (?:test|tests|results|condition|treatment)\b/,
];

/** S2: true when the text clearly talks about a health matter. */
export function mentionsHealth(...texts: Array<string | null | undefined>): boolean {
  const text = normalizeForSafety(texts.filter((t): t is string => typeof t === "string").join(" \n "));
  if (!text) return false;
  return HEALTH_PATTERNS.some((re) => re.test(text));
}

/**
 * The saved reading stores the category display name ("Health and
 * Wellness"); the intake payload sends the key ("health"). Match
 * either, so category guardrails work for both.
 */
export function isCategory(category: unknown, key: "health" | "finances"): boolean {
  if (typeof category !== "string") return false;
  const c = category.trim().toLowerCase();
  if (c === key) return true;
  const name = INTAKE_CATEGORIES.find((cat) => cat.key === key)?.name;
  return !!name && c === name.toLowerCase();
}
