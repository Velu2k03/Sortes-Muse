import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, spendUserCredits } from "@/lib/db";
import cardsData from "@/data/cards.json";
import { SENSITIVE_KEYS } from "@/lib/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25000;
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
}

const TAGALOG_MARKERS =
  /\b(ako|ikaw|siya|kami|tayo|sila|kayo|ang|ng|mga|hindi|oo|opo|salamat|kasi|pero|ano|saan|kailan|bakit|paano|naman|lang|rin|din|dito|diyan|doon|gusto|ayaw|mahal|puso|buhay|araw|gabi|tulong|tanong|sagot)\b/i;

function detectTaglish(text: string): boolean {
  return TAGALOG_MARKERS.test(text);
}

function cardById(id: string) {
  return (cardsData as Array<{ id: string; keywords: { upright: string[]; reversed: string[] }; meaning: { upright: string; reversed: string } }>).find(
    (c) => c.id === id
  );
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
- Keep the reading 350-550 words. Structure: a short opening that names their question, one section per card position, then a closing reflection with one gentle question for them to sit with.
- Never moralize, never repeat their story back verbatim, never invent facts about them beyond what they shared.
- ${language}
${healthGuard}`;
}

function buildUserPrompt(cards: ApiCard[], intake: Intake): string {
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

  return `Area of life: ${intake.categoryName}
Seeker's first name: ${intake.firstName}

Their details:
${safeAnswers || "(none provided)"}

Their story in their own words:
${intake.story}

The exact question they want clarity on:
${intake.question}

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

  let body: { cards?: ApiCard[]; intake?: Intake; spreadSlug?: string };
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

  const firstName = (intake.firstName || "friend").slice(0, 40);
  const apiKey = process.env.OPENROUTER_API_KEY;
  // Comma-separated fallback chain: fastest free models first, reliable
  // workhorse last. Override with OPENROUTER_MODEL in env.
  const modelList = (
    process.env.OPENROUTER_MODEL ||
    "google/gemini-2.5-flash-preview:free,xiaomi/mimo-v2-flash:free,meta-llama/llama-3.3-70b-instruct:free"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // M0.1 credit authority: the session is read here, but nothing is
  // spent until a real model has generated text (see below). Guests
  // (no session) keep the client-side localStorage wallet; the money
  // boundary is sign-in, because guests have no server account to charge.
  const session = await getSession();

  // No key configured: fail honestly instead of serving static text as
  // a reading. No credit is spent on this path.
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI generation is not configured on this server right now. No credit was spent. Please try again later.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  const taglish = detectTaglish(`${intake.story} ${intake.question}`);
  const isHealth = intake.category === "health";

  // Try each model in order; rate-limited or retired free models fail fast
  // and we move to the next one instead of giving up.
  let generated: { text: string; model: string } | null = null;
  for (const model of modelList) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://sortes.resonantatlas.com",
          "X-Title": "Sortes by Resonant Atlas",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(firstName, taglish, isHealth),
            },
            { role: "user", content: buildUserPrompt(cards, intake) },
          ],
          temperature: 0.8,
          max_tokens: 1200,
        }),
      });

      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);

      const data = await res.json();
      const text: string | undefined =
        data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty model response");

      generated = { text, model: data?.model ?? model };
      clearTimeout(timer);
      break;
    } catch {
      clearTimeout(timer);
      // Fall through to the next model in the chain.
    }
  }

  // Every model failed (slow, rate-limited, or erroring): fail honestly.
  // A paying user must never pay for static text, so no static fallback
  // is served here and no credit is spent on this path.
  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The reading could not be generated just now. No credit was spent. Please try again in a moment.",
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
  // withheld rather than delivered unpaid.
  if (session) {
    const ok = await spendUserCredits(session.userId, 1);
    if (!ok) {
      return NextResponse.json(
        { error: "You need 1 credit for this reading. No credit was spent." },
        { status: 402 }
      );
    }
    const user = await getUserById(session.userId);
    return NextResponse.json({
      interpretation: finalText,
      model: generated.model,
      fallback: false,
      credits: user?.credits ?? 0,
    });
  }

  return NextResponse.json({
    interpretation: finalText,
    model: generated.model,
    fallback: false,
  });
}
