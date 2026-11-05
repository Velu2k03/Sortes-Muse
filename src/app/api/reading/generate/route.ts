import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeReading,
  markFreeReadingUsed,
} from "@/lib/db";
import cardsData from "@/data/cards.json";
import { SENSITIVE_KEYS } from "@/lib/intake";
import { getSpread } from "@/lib/tarot";
import { computeSpreadFacts, type FactCard } from "@/lib/spread-facts";
import { generateChat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// M0.2 health guardrail parity: the chart route already appends this
// server-side when missing; the tarot route now does the same, so the
// closing sentence does not depend on the model obeying the prompt.
const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";

// Simple in-memory rate limit: 20 generations per IP per hour.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 20;
}

interface ApiCard {
  cardId: string;
  reversed: boolean;
  position: string;
  name: string;
}

interface Intake {
  category: string;
  categoryName: string;
  firstName: string;
  answers: Record<string, string>;
  story: string;
  question: string;
  firstImpression?: string;
}

const TAGALOG_MARKERS =
  /\b(ako|ikaw|siya|kami|tayo|sila|kayo|ang|ng|mga|hindi|oo|opo|salamat|kasi|pero|ano|saan|kailan|bakit|paano|naman|lang|rin|din|dito|diyan|doon|gusto|ayaw|mahal|puso|buhay|araw|gabi|tulong|tanong|sagot)\b/i;

function detectTaglish(text: string): boolean {
  return TAGALOG_MARKERS.test(text);
}

type DeckCard = {
  id: string;
  name: string;
  arcana: "major" | "minor";
  suit: string | null;
  number: number;
  keywords: { upright: string[]; reversed: string[] };
  meaning: { upright: string; reversed: string };
};

function cardById(id: string): DeckCard | undefined {
  return (cardsData as DeckCard[]).find((c) => c.id === id);
}

// M1.1 output validation: a reading must be substantive and grounded
// in the actual draw. Invalid text is discarded and the next model is
// tried; if no model validates, the route fails honestly with no spend
// (the M0.1 fallback path). The thresholds are deliberately lenient:
// the goal is to catch generic filler, not to police good prose.
function isValidReading(text: string, cards: ApiCard[]): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 100 || words > 1200) return false;
  const lower = text.toLowerCase();
  const mentioned = cards.filter((c) => lower.includes(c.name.toLowerCase())).length;
  return mentioned >= Math.ceil(cards.length / 2);
}

function buildSystemPrompt(firstName: string, taglish: boolean, isHealth: boolean): string {
  const language = taglish
    ? "The seeker wrote in Tagalog/Taglish. Write the entire reading in the same language mix they used (Tagalog/Taglish), warm and natural."
    : "Write the entire reading in English.";
  const healthGuard = isHealth
    ? `HEALTH GUARDRAIL: This is general wellness reflection ONLY. Never diagnose any condition, never name a disease or disorder, never predict medical outcomes, never suggest medication or dosage. Always close with this exact sentence: "This reflection is not medical advice. Please speak with a licensed professional about any health concern."`
    : "";
  return `You are Sortes, a warm and thoughtful tarot reader inside a reflective tarot app. You write personal readings that weave the drawn cards into the seeker's own story.

Rules you must always follow:
- Address the seeker by first name (${firstName}) in a warm, second-person voice.
- Frame everything as reflection and perspective, NEVER as guaranteed prediction. Never claim certainty about the future. Use language like "this may invite you to consider", "a mirror for", "worth sitting with".
- Weave each card's traditional meaning into THEIR specific situation and question. Reference card names, positions, and orientations naturally.
- Name every drawn card in its position. When the spread facts name a dominant suit and element, name them and say what they emphasize. When the spread facts name a tension pair, name both cards and the tension between them. Never invent a card, a position, or a relationship that is not in the spread facts.
- Keep the reading 350-550 words. Structure: a short opening that names their question in their own terms, one section per card position, then a closing section that answers their question directly, in this order: What stands out for your question; the tension or opportunity in this draw; what you may be overlooking; one practical step you could take, small and concrete, never medical or financial advice; and exactly one reflection question for them to sit with. Do not add a generic advice paragraph that could fit any question: every closing point must tie back to their question, their story, or a named card.
- Never moralize, never repeat their story back verbatim, never invent facts about them beyond what they shared.
- ${language}
${healthGuard}`;
}

function buildUserPrompt(
  cards: ApiCard[],
  intake: Intake,
  spreadLabel: string,
  factsSummary: string
): string {
  const cardLines = cards
    .map((c) => {
      const data = cardById(c.cardId);
      const orientation = c.reversed ? "reversed" : "upright";
      const keywords = data
        ? (c.reversed ? data.keywords.reversed : data.keywords.upright).join(", ")
        : "";
      const meaning = data
        ? c.reversed
          ? data.meaning.reversed
          : data.meaning.upright
        : "";
      return `- Position "${c.position}": ${c.name} (${orientation}). Keywords: ${keywords}. Traditional meaning: ${meaning}`;
    })
    .join("\n");

  const safeAnswers = Object.entries(intake.answers)
    .filter(([k, v]) => !SENSITIVE_KEYS.includes(k) && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join("\n");

  const impression = (intake.firstImpression ?? "").trim().slice(0, 100);
  return `Area of life: ${intake.categoryName}
Seeker's first name: ${intake.firstName}

Their details:
${safeAnswers || "(none provided)"}

Their story in their own words:
${intake.story}

The exact question they want clarity on:
${intake.question}
${impression ? `\nSeeker's first impression, in their own word: ${impression}\n` : ""}
Spread: ${spreadLabel}

Spread facts, computed from the draw (use these, do not invent others):
${factsSummary}

Cards drawn:
${cardLines}

Write the personalized reading now.`;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many readings right now. Please try again later." },
      { status: 429 }
    );
  }

  let body: {
    cards?: ApiCard[];
    intake?: Intake;
    spreadSlug?: string;
    /** Guest device claim: the device-local free flag says this is the
        first Quick Insight. Only honoured for guests (no session) and
        only for quick-insight; signed-in users are checked against
        the server record instead. */
    claimFree?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { cards, intake } = body;
  if (!cards?.length || !intake?.story || !intake?.question) {
    return NextResponse.json(
      { error: "Missing cards, story, or question." },
      { status: 400 }
    );
  }
  // Phase 2, 2.4: length caps, enforced server-side. Over-long input
  // is rejected with a clear message instead of silently truncated
  // or passed to the model unbounded.
  if (typeof intake.story !== "string" || intake.story.length > 2000) {
    return NextResponse.json(
      { error: "Story must be 2000 characters or fewer." },
      { status: 400 }
    );
  }
  if (typeof intake.question !== "string" || intake.question.length > 300) {
    return NextResponse.json(
      { error: "Question must be 300 characters or fewer." },
      { status: 400 }
    );
  }
  if (cards.length > 20) {
    return NextResponse.json(
      { error: "Too many cards in one reading (maximum 20)." },
      { status: 400 }
    );
  }
  if (
    intake.answers &&
    typeof intake.answers === "object" &&
    Object.values(intake.answers).some(
      (v) => typeof v === "string" && v.length > 1000
    )
  ) {
    return NextResponse.json(
      { error: "Each answer must be 1000 characters or fewer." },
      { status: 400 }
    );
  }

  const firstName = (intake.firstName || "friend").slice(0, 40);
  const apiKey = process.env.OPENROUTER_API_KEY;

  // M0.1 credit authority: the session is read here, but nothing is
  // spent until a real model has generated text (see below). Guests
  // (no session) keep the client-side localStorage wallet; the money
  // boundary is sign-in, because guests have no server account to charge.
  const session = await getSession();

  // Phase 2, 2.1: the first Quick Insight is free (FAQ rule, per
  // device). For signed-in users the server record is authoritative
  // and the free use is marked only after a real generation (below),
  // so a failed generation never consumes it. For guests the device
  // flag is the record: the client sends claimFree, the server spends
  // nothing for guests either way, and the client marks its flag only
  // after a successful generation. Other spreads are never free.
  const isQuickInsight = body.spreadSlug === "quick-insight";
  const serverFree =
    session && isQuickInsight
      ? !(await hasUsedFreeReading(session.userId))
      : false;
  const guestFree =
    !session && isQuickInsight && body.claimFree === true;

  // No key configured: fail honestly instead of serving static text as
  // a reading. No credit is spent on this path.
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI generation is not configured on this server right now. No Oracle was spent. Please try again later.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  const taglish = detectTaglish(`${intake.story} ${intake.question}`);
  const isHealth = intake.category === "health";

  // M1.1: computed spread facts ground the interpretation in the draw.
  // Unknown card ids are skipped for facts (validation still uses the
  // client-provided names); an unknown spread slug falls back to itself.
  const factCards: FactCard[] = cards
    .map((c) => {
      const d = cardById(c.cardId);
      if (!d) return null;
      return {
        cardId: c.cardId,
        name: d.name,
        reversed: c.reversed,
        position: c.position,
        arcana: d.arcana,
        suit: d.suit,
        number: d.number,
      };
    })
    .filter((c): c is FactCard => c !== null);
  const factsSummary = computeSpreadFacts(factCards).summary;
  let spreadLabel = body.spreadSlug ?? "custom spread";
  try {
    if (body.spreadSlug) spreadLabel = `${getSpread(body.spreadSlug).name} (${body.spreadSlug})`;
  } catch {
    // Unknown slug: keep the raw slug as the label.
  }

  // One shared client (src/lib/ai.ts): the :free chain, per-model
  // timeout, retry across models, and structured failure logging.
  // The grounding validator discards ungrounded text and tries the
  // next model instead of delivering generic filler as a personal
  // reading.
  const generated = await generateChat({
    apiKey: apiKey ?? "",
    system: buildSystemPrompt(firstName, taglish, isHealth),
    user: buildUserPrompt(cards, intake, spreadLabel, factsSummary),
    temperature: 0.8,
    maxTokens: 1200,
    validate: (text) => isValidReading(text, cards),
  });

  // Every model failed (slow, rate-limited, or erroring): fail honestly.
  // A paying user must never pay for static text, so no static fallback
  // is served here and no credit is spent on this path.
  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The reading could not be generated just now. No Oracle was spent. Please try again in a moment.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  // Enforce the health closing sentence server-side instead of trusting
  // the model to include it.
  const finalText =
    isHealth && !generated.text.includes(HEALTH_CLOSE)
      ? `${generated.text}\n\n${HEALTH_CLOSE}`
      : generated.text;

  // Spend only after a real generation, so a failed generation can never
  // cost a credit and no refund path is needed. The spend is atomic
  // (credits >= 1 checked in the update); if it fails, the text is
  // withheld rather than delivered unpaid. A first free Quick Insight
  // marks the server record instead of spending.
  if (session) {
    if (serverFree) {
      await markFreeReadingUsed(session.userId);
    } else {
      const ok = await spendUserCredits(session.userId, 1);
      if (!ok) {
        return NextResponse.json(
          { error: "You need 1 Oracle for this reading. No Oracle was spent." },
          { status: 402 }
        );
      }
    }
    const user = await getUserById(session.userId);
    return NextResponse.json({
      interpretation: finalText,
      model: generated.model,
      fallback: false,
      free: serverFree,
      credits: user?.credits ?? 0,
    });
  }

  return NextResponse.json({
    interpretation: finalText,
    model: generated.model,
    fallback: false,
    free: guestFree,
  });
}
