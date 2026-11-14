import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  getReadingForUser,
  appendFollowUpWithSpend,
} from "@/lib/db";
import type { FollowUp } from "@/lib/types";
import { isUuid } from "@/lib/ids";
import cardsData from "@/data/cards.json";
import { generateChat } from "@/lib/ai";
import { preCheckOracleBalance } from "@/lib/credit-precheck";
import { followUpCost } from "@/lib/subscription-tiers";
import { validateFollowUpText } from "@/lib/output-validation";
import { logGuestGeneration } from "@/lib/guestLogging";
import { drawClarifierCard } from "@/lib/clarifier";
import { CARDS } from "@/lib/cards";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Covers the 170 s AI retry budget plus the DB write (Vercel Fluid: 300 s max on every plan).
// 300 s Fluid ceiling on Hobby; 170 s AI budget leaves 130 s margin (see reading/generate).
export const maxDuration = 300;

const MAX_FOLLOWUPS = 3;

const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";
const FINANCES_CLOSE =
  "This reflection is not financial advice. Please speak with a licensed professional about any financial decision.";

type DeckCard = {
  id: string;
  name: string;
};

function cardNameById(id: string): string | undefined {
  return (cardsData as DeckCard[]).find((c) => c.id === id)?.name;
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
  isFinances: boolean,
  clarifierName?: string | null
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
- Never start a new reading. ${clarifierName ? `One clarifier card was drawn for this follow-up: ${clarifierName}. Read it as one extra thread alongside the original cards, not as a new spread.` : "Never draw new cards."} Never draw any further cards, and never invent cards or positions not listed below.
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
  const clarifierLine = clarifierName
    ? `Clarifier card drawn for this follow-up: ${clarifierName}`
    : "";

  const user = `${originalQ}
${reading.category ? `Category: ${reading.category}` : ""}

Original cards:
${cardLines || "(none)"}

${clarifierLine}

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
  // Phase 6: shared limiter (was a per-route map: 10/hr/IP).
  if (!(await checkRateLimit(ipLimitKey("follow-up", clientIp(req)), RATE_LIMITS.aiFollowUpIp)).allowed) {
    return rateLimitExceeded();
  }

  let body: {
    readingId?: string;
    question?: string;
    /** Client-minted attempt id; a retry with the same id replays the
        saved answer, never generates or spends twice. Batch 1 (C2). */
    followUpId?: string;
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
  if (body.followUpId !== undefined && !isUuid(body.followUpId)) {
    return NextResponse.json({ error: "followUpId must be a UUID." }, { status: 400 });
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
    // Guests get no follow-ups: the free/paid state would come from the
    // request body (an empty followUps array made every follow-up free).
    return NextResponse.json(
      { error: "Sign in to ask a follow-up." },
      { status: 401 }
    );
  }

  // Batch 1 (C2): replay. If this attempt id already has a saved
  // follow-up (the first response was lost after the server saved it),
  // return the saved answer with no model call and no spend. This check
  // runs before the cap, because the saved follow-up is what filled
  // the slot it now replays. The id is bound to the question: the same
  // id with a different question is a client error, not a replay.
  if (body.followUpId) {
    const saved = existingFollowUps.find((f) => f.id === body.followUpId);
    if (saved) {
      if (saved.question !== question) {
        return NextResponse.json(
          { error: "This attempt id was already used for a different question." },
          { status: 409 }
        );
      }
      const dbUser = await getUserById(session.userId);
      return NextResponse.json({
        answer: saved.answer,
        free: saved.free,
        credits: dbUser?.credits ?? 0,
        followUps: existingFollowUps,
        replayed: true,
      });
    }
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

  // Phase 6 (N5): balance check before the model call (signed-in,
  // non-free follow-ups cost 1 Oracle while the credit-cost flag is
  // OFF, 50 credits once it is ON). Without it a user with 0
  // credits got a full generation and only then a 402. The spend
  // after generation stays as the atomic enforcement.
  // F11: shared helper (src/lib/credit-precheck.ts).
  const preCheck = await preCheckOracleBalance(session?.userId, !!session && !isFree, "follow-up", followUpCost());
  if (preCheck.denied) return preCheck.denied;

  // Phase 5 (5.3): draw 1 real clarifier card server-side, from the
  // cards NOT already in this reading's spread, uniformly at random.
  // The draw happens once per follow-up attempt, before generation,
  // and is saved with the follow-up below. Cost logic is untouched:
  // isFree and the 3-follow-up cap above are exactly as before.
  const spreadCardIds = (Array.isArray(readingData.cards) ? readingData.cards : [])
    .map((c) => (c as { cardId?: unknown }).cardId)
    .filter((id): id is string => typeof id === "string");
  const clarifierCardId = drawClarifierCard(spreadCardIds, CARDS.map((c) => c.id));
  const clarifierName = clarifierCardId ? cardNameById(clarifierCardId) ?? null : null;

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
    isFinances,
    clarifierName
  );

  // One shared client (src/lib/ai.ts). Phase E (item 1): the lenient
  // word-count validation (20 to 800 words) now also requires the
  // answer to name at least one card from the original reading or the
  // clarifier drawn for this follow-up, so a generic answer that
  // never touches the reading is discarded and the next model is
  // tried, same as the tarot route. The card names come from the
  // reading the route already loaded (database for signed-in users,
  // whitelisted guest object for guests).
  const originalCardNames = (Array.isArray(readingData.cards) ? readingData.cards : [])
    .map((c) => {
      const card = c as { name?: unknown; cardId?: unknown };
      return typeof card.name === "string" && card.name
        ? card.name
        : typeof card.cardId === "string"
          ? cardNameById(card.cardId) ?? ""
          : "";
    })
    .filter((n): n is string => n.length > 0);
  const generated = await generateChat({
    apiKey,
    system,
    user,
    temperature: 0.8,
    maxTokens: 1200,
    validate: (text) =>
      validateFollowUpText(text, { cardNames: originalCardNames, clarifierName: clarifierName }),
    route: "reading/follow-up",
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
    // Phase 5 (5.3): the clarifier card is saved with the follow-up
    // in the journal/reading record, so the thread shows what was
    // drawn. Null (deck exhausted) stores as absent.
    ...(clarifierCardId ? { clarifierCardId } : {}),
  };
  const updatedFollowUps = [...existingFollowUps, newFollowUp];

  if (session) {
    // Phase 6 (N7) + Phase B (F4): append + spend atomically (see db.ts).
    // The cap and the free grant are re-checked inside the transaction,
    // so two concurrent follow-ups cannot both pass the cap or both
    // claim the free grant, and a failed append never spends a credit.
    // The old code spent first and never checked the update's return.
    const appended = await appendFollowUpWithSpend(
      session.userId,
      body.readingId!,
      newFollowUp as unknown as Record<string, unknown>,
      isFree ? 0 : followUpCost(),
      MAX_FOLLOWUPS,
      isFree,
      body.followUpId
    );
    if (!appended.ok) {
      if (appended.reason === "limit") {
        return NextResponse.json(
          { error: "This reading has reached its follow-up limit (3). The thread is complete." },
          { status: 409 }
        );
      }
      if (appended.reason === "mismatch") {
        return NextResponse.json(
          { error: "This attempt id was already used for a different question." },
          { status: 409 }
        );
      }
      if (appended.reason === "insufficient") {
        return NextResponse.json(
          { error: "You need 1 Oracle for this follow-up. No Oracle was spent." },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: "Reading not found." }, { status: 404 });
    }
    // Batch 1 (C2): a concurrent duplicate attempt with the same id
    // lost the race inside the transaction; serve the saved answer.
    if (appended.replayed) {
      const saved = (appended.followUps as FollowUp[] | undefined)?.find(
        (f) => f.id === body.followUpId
      );
      const dbUser = await getUserById(session.userId);
      return NextResponse.json({
        answer: saved?.answer ?? finalText,
        free: appended.free ?? isFree,
        credits: dbUser?.credits ?? 0,
        followUps: appended.followUps ?? updatedFollowUps,
        replayed: true,
      });
    }
    const dbUser = await getUserById(session.userId);
    return NextResponse.json({
      answer: finalText,
      free: appended.free ?? isFree,
      credits: dbUser?.credits ?? 0,
      followUps: appended.followUps ?? updatedFollowUps,
    });
  }

  // Guest: no server spend, return data for client-side save.
  // Phase B (R6): the successful guest generation is logged so
  // abuse is visible per route in the log drain.
  logGuestGeneration("reading/follow-up");
  return NextResponse.json({
    answer: finalText,
    free: isFree,
    followUps: updatedFollowUps,
  });
}
