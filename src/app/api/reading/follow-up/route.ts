import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  spendUserCredits,
  getReadingForUser,
  updateReadingForUser,
} from "@/lib/db";
import type { FollowUp } from "@/lib/types";
import cardsData from "@/data/cards.json";
import { generateChat } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FOLLOWUPS = 3;

const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";
const FINANCES_CLOSE =
  "This reflection is not financial advice. Please speak with a licensed professional about any financial decision.";

// Own in-memory rate bucket, separate from the generate route.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  rec.count += 1;
  return rec.count > 10;
}

// Whitelist for guest-sent reading fields. Never trust extra keys.
const READING_WHITELIST = [
  "question",
  "interpretation",
  "cards",
  "category",
  "firstImpression",
  "nextStep",
  "followUps",
  "aiGenerated",
  "chartSummary",
] as const;

// Birth-like keys that must never enter a prompt, even on tarot.
const BIRTH_KEYS = /birth|dob|dateOfBirth|birthDate|birthTime|birthPlace|birthday/i;

type DeckCard = {
  id: string;
  name: string;
};

function cardNameById(id: string): string | undefined {
  return (cardsData as DeckCard[]).find((c) => c.id === id)?.name;
}

// Word count for lenient validation (20 to 800 words).
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildFollowUpPrompt(
  reading: {
    question?: string;
    interpretation?: string;
    cards?: Array<{ cardId?: string; position?: string; name?: string }>;
    category?: string;
    firstImpression?: string;
    nextStep?: string;
  },
  followUpQuestion: string,
  isHealth: boolean,
  isFinances: boolean
): { system: string; user: string } {
  // Card summary from the original reading
  const cardLines = (reading.cards || [])
    .map((c) => {
      const name = c.name || (c.cardId ? cardNameById(c.cardId) : undefined) || "unknown card";
      return `- ${c.position || "card"}: ${name}`;
    })
    .join("\n");

  let healthGuard = "";
  if (isHealth) {
    healthGuard = `HEALTH GUARDRAIL: This is general wellness reflection ONLY. Never diagnose any condition, never name a disease or disorder, never predict medical outcomes, never suggest medication or dosage. Always close with this exact sentence: "${HEALTH_CLOSE}"`;
  }

  let financesGuard = "";
  if (isFinances) {
    financesGuard = `FINANCES GUARDRAIL: This is general reflection about money and resources ONLY. Never recommend specific investments, securities, insurance products, or tax strategies. Never predict market outcomes. Always close with this exact sentence: "${FINANCES_CLOSE}"`;
  }

  const system = `You are Sortes, a warm and thoughtful tarot reader answering a follow-up question about a reading you already gave.

Rules:
- Answer ONLY this follow-up question in the context of the original reading below.
- Never start a new reading. Never draw new cards. Never invent cards or positions not listed below.
- Reference the original cards, question, interpretation, first impression, and chosen next step when they are relevant to the follow-up.
- Keep it to one thread: stay inside this reading's scope.
- Frame everything as reflection and perspective, never as guaranteed prediction.
- Target 150 to 300 words. Be concise and grounded.
${healthGuard}
${financesGuard}`.trim();

  const originalQ = reading.question ? `Original question: ${reading.question}` : "";
  const impression = reading.firstImpression
    ? `Seeker's first impression: ${reading.firstImpression}`
    : "";
  const step = reading.nextStep ? `Chosen next step: ${reading.nextStep}` : "";

  const user = `${originalQ}
${reading.category ? `Category: ${reading.category}` : ""}

Original cards:
${cardLines || "(none)"}

Original interpretation (summary):
${(reading.interpretation || "").slice(0, 2000)}

${impression}
${step}

Follow-up question from the seeker:
${followUpQuestion}

Answer this follow-up now.`.trim();

  return { system, user };
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many follow-up requests right now. Please try again later." },
      { status: 429 }
    );
  }

  let body: {
    readingId?: string;
    question?: string;
    reading?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Validate question: required, 1 to 300 characters.
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length < 1 || question.length > 300) {
    return NextResponse.json(
      { error: "Question is required and must be 1 to 300 characters." },
      { status: 400 }
    );
  }

  const session = await getSession();

  // Signed-in flow: load from database by readingId.
  // Guest flow: build from the client-sent reading object.
  let readingData: Record<string, unknown>;
  let existingFollowUps: FollowUp[];

  if (session) {
    // Signed-in: require readingId
    if (typeof body.readingId !== "string" || !body.readingId) {
      return NextResponse.json(
        { error: "readingId is required for signed-in users." },
        { status: 400 }
      );
    }
    const stored = await getReadingForUser(session.userId, body.readingId);
    if (!stored || typeof stored !== "object") {
      return NextResponse.json(
        { error: "Reading not found." },
        { status: 404 }
      );
    }
    readingData = stored as Record<string, unknown>;
    existingFollowUps = Array.isArray(readingData.followUps)
      ? (readingData.followUps as FollowUp[])
      : [];
  } else {
    // Guest: build from whitelisted fields only
    if (!body.reading || typeof body.reading !== "object") {
      return NextResponse.json(
        { error: "reading object is required for guest follow-ups." },
        { status: 400 }
      );
    }
    // Whitelist: only copy safe keys
    readingData = {};
    for (const key of READING_WHITELIST) {
      if (key in body.reading && !BIRTH_KEYS.test(key)) {
        readingData[key] = body.reading[key];
      }
    }
    // Strip any birth-like keys from cards too
    if (Array.isArray(readingData.cards)) {
      readingData.cards = (readingData.cards as Record<string, unknown>[]).map(
        (c) => {
          const safe: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(c)) {
            if (!BIRTH_KEYS.test(k)) safe[k] = v;
          }
          return safe;
        }
      );
    }
    existingFollowUps = Array.isArray(readingData.followUps)
      ? (readingData.followUps as FollowUp[]).slice(0, MAX_FOLLOWUPS)
      : [];
  }

  // Phase 2, 2.4: guest-sent reading fields are untrusted input.
  // Cap them before they reach the prompt; the question cap above
  // (1-300) already returns 400. Signed-in readings come from the
  // database, so these caps bite on the guest path.
  const tooLong = (v: unknown, max: number) =>
    typeof v === "string" && v.length > max;
  if (tooLong(readingData.interpretation, 20000)) {
    return NextResponse.json(
      { error: "Reading text must be 20000 characters or fewer." },
      { status: 400 }
    );
  }
  if (tooLong(readingData.firstImpression, 500) || tooLong(readingData.nextStep, 500)) {
    return NextResponse.json(
      { error: "First impression and next step must be 500 characters or fewer each." },
      { status: 400 }
    );
  }
  if (Array.isArray(readingData.cards) && readingData.cards.length > 20) {
    return NextResponse.json(
      { error: "Too many cards in one reading (maximum 20)." },
      { status: 400 }
    );
  }

  // Tarot only: reject chart readings (which carry chartSummary).
  if (readingData.chartSummary) {
    return NextResponse.json(
      { error: "Follow-ups are only available for tarot readings in this version." },
      { status: 400 }
    );
  }
  // Must be an AI-generated reading with an interpretation.
  if (!readingData.aiGenerated || !readingData.interpretation) {
    return NextResponse.json(
      { error: "Follow-ups require a completed tarot reading with an interpretation." },
      { status: 400 }
    );
  }

  // Cap: a reading may hold at most 3 follow-ups.
  if (existingFollowUps.length >= MAX_FOLLOWUPS) {
    return NextResponse.json(
      { error: "This reading has reached its follow-up limit (3). The thread is complete." },
      { status: 409 }
    );
  }

  // Free flag: first follow-up per reading is free, then 1 credit each.
  const isFree = existingFollowUps.length === 0;

  // Determine category for guardrails
  const category =
    typeof readingData.category === "string" ? readingData.category : "";
  const isHealth = category === "health";
  const isFinances = category === "finances";

  const apiKey = process.env.OPENROUTER_API_KEY;
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

  const { system, user } = buildFollowUpPrompt(
    {
      question: typeof readingData.question === "string" ? readingData.question : undefined,
      interpretation: typeof readingData.interpretation === "string" ? readingData.interpretation : undefined,
      cards: Array.isArray(readingData.cards) ? readingData.cards as Array<{ cardId?: string; position?: string; name?: string }> : undefined,
      category,
      firstImpression: typeof readingData.firstImpression === "string" ? readingData.firstImpression : undefined,
      nextStep: typeof readingData.nextStep === "string" ? readingData.nextStep : undefined,
    },
    question,
    isHealth,
    isFinances
  );

  // One shared client (src/lib/ai.ts). The lenient word-count
  // validation (20 to 800 words) discards thin or bloated text and
  // tries the next model, same as before the migration.
  const generated = await generateChat({
    apiKey,
    system,
    user,
    temperature: 0.8,
    maxTokens: 1200,
    validate: (text) => {
      const wc = wordCount(text);
      return wc >= 20 && wc <= 800;
    },
  });

  // Every model failed: fail honestly with no spend.
  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The follow-up could not be generated just now. No Oracle was spent. Please try again in a moment.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  // Enforce guardrail closing sentences server-side.
  let finalText = generated.text;
  if (isHealth && !finalText.includes(HEALTH_CLOSE)) {
    finalText = `${finalText}\n\n${HEALTH_CLOSE}`;
  }
  if (isFinances && !finalText.includes(FINANCES_CLOSE)) {
    finalText = `${finalText}\n\n${FINANCES_CLOSE}`;
  }

  const newFollowUp: FollowUp = {
    question,
    answer: finalText,
    createdAt: new Date().toISOString(),
    free: isFree,
  };
  const updatedFollowUps = [...existingFollowUps, newFollowUp];

  if (session) {
    // Signed-in: spend 1 credit server-side AFTER generation when not free.
    if (!isFree) {
      const ok = await spendUserCredits(session.userId, 1);
      if (!ok) {
        return NextResponse.json(
          {
            error:
              "You need 1 Oracle for this follow-up. No Oracle was spent.",
          },
          { status: 402 }
        );
      }
    }
    // Persist the follow-up on the stored reading.
    await updateReadingForUser(session.userId, body.readingId!, {
      followUps: updatedFollowUps,
    });
    const dbUser = await getUserById(session.userId);
    return NextResponse.json({
      answer: finalText,
      free: isFree,
      credits: dbUser?.credits ?? 0,
      followUps: updatedFollowUps,
    });
  }

  // Guest: no server spend, return data for client-side save.
  return NextResponse.json({
    answer: finalText,
    free: isFree,
    followUps: updatedFollowUps,
  });
}
