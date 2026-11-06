import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, spendUserCredits } from "@/lib/db";
import {
  validateBirthInput,
  buildTransitData,
  buildYearAheadData,
  buildComparisonData,
  transitPromptLines,
  yearAheadPromptLines,
  comparisonPromptLines,
  reportTitle,
} from "@/lib/reports";
import type { ReportType, SavedReport } from "@/lib/reports";
import { generateChat } from "@/lib/ai";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// M4.1: premium keep-forever reports. This route computes and
// interprets only; it does NOT save. The client saves the returned
// report with POST /api/reports (signed-in) or to device-local
// storage (guest), reusing the server-generated id, so a failed save
// can be retried without another charge. That separation is what
// keeps the money states clean: spend happens once, after a real
// generation, and saving never costs a credit.
//
// Credit rule: 1 credit per report, no free first use. Reports are
// the premium paid moment, sold per report and never rented. Guests
// keep the device-local wallet: the server spends nothing for them,
// and the client deducts locally only after a successful generation.
// Privacy is enforced by construction: the builders receive birth
// inputs server-side, but the prompt lines and the saved report
// contain positions and signs only. Birth dates, times, coordinates,
// and place names are never stored and never sent to AI.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";
const FINANCES_CLOSE =
  "This reflection is not financial advice. Please speak with a licensed professional about any financial decision.";

const TYPES: ReportType[] = ["transit", "year-ahead", "comparison"];

const SHARED_RULES = `Rules you must always follow:
- Frame everything as reflection and perspective, NEVER as guaranteed prediction. Never claim certainty about the future. Use language like "this may invite you to consider", "a mirror for", "worth sitting with".
- Name only the placements, aspects, and dates given in the report data. Never invent a placement, aspect, house, or date that is not in the data.
- HEALTH GUARDRAIL: This is general wellness reflection ONLY. Never diagnose any condition, never name a disease or disorder, never predict medical outcomes, never suggest medication or dosage.
- FINANCES GUARDRAIL: This is general reflection about money and resources ONLY. Never recommend specific investments, securities, insurance products, or tax strategies. Never predict market outcomes.
- Never moralize.
- Write the entire reflection in English.`;

const TYPE_PROMPTS: Record<ReportType, { maxTokens: number; system: string; structure: string }> = {
  transit: {
    maxTokens: 1200,
    system: "You are Sortes, a warm and thoughtful chart reader inside a reflective astrology app. You write a transit report: how the sky on one chosen date interacts with a natal chart.",
    structure: "Keep the reflection 350-550 words. Structure: a short opening naming the date's overall tone, one section per strongest transit group, then a closing reflection with one gentle question for them to sit with.",
  },
  "year-ahead": {
    maxTokens: 1600,
    system: "You are Sortes, a warm and thoughtful chart reader inside a reflective astrology app. You write a year-ahead reading: month-by-month themes for one calendar year, plus the longer dasha and Ziwei period layers.",
    structure: "Keep the reflection 500-700 words. Structure: a short opening naming the year's overall arc, one short section per quarter grouping its months, a section on the longer period layers, then a closing reflection with one gentle question for them to sit with. Never present a month as a guaranteed event; themes and invitations only.",
  },
  comparison: {
    maxTokens: 1200,
    system: "You are Sortes, a warm and thoughtful chart reader inside a reflective astrology app. You write a relationship comparison between two charts.",
    structure: "Keep the reflection 350-550 words. Structure: a short opening naming the two Sun and Moon combinations, one section per strongest cross-aspect group, then a closing reflection with one gentle question for both people to sit with. NEVER give a verdict: never say compatible or incompatible, never score the relationship, never predict whether it will last. Describe dynamics only: where the charts stimulate, support, or create friction.",
  },
};

export async function POST(req: NextRequest) {
  // Phase 6: shared limiter (was a per-route map: 20/hr/IP).
  if (!checkRateLimit(`reports-generate:${clientIp(req)}`, RATE_LIMITS.reportsGenerateIp).allowed) {
    return rateLimitExceeded();
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const type = body.type;
  if (typeof type !== "string" || !(TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: "type must be transit, year-ahead, or comparison." }, { status: 400 });
  }
  const reportType = type as ReportType;

  let lines: string;
  let targetLabel: string;
  let reportData: SavedReport["data"];
  try {
    if (reportType === "transit") {
      const birth = validateBirthInput(body.birth);
      if (!birth) return NextResponse.json({ error: "birth details are incomplete or out of range." }, { status: 400 });
      const targetDate = typeof body.targetDate === "string" ? body.targetDate : "";
      const data = buildTransitData(birth, targetDate);
      lines = transitPromptLines(data);
      reportData = data;
      targetLabel = targetDate;
    } else if (reportType === "year-ahead") {
      const birth = validateBirthInput(body.birth);
      if (!birth) return NextResponse.json({ error: "birth details are incomplete or out of range." }, { status: 400 });
      if (birth.gender === null) {
        return NextResponse.json({ error: "gender is required for a year-ahead reading (Ziwei annual layer)." }, { status: 400 });
      }
      const year = typeof body.year === "number" ? body.year : NaN;
      const data = buildYearAheadData(birth, year);
      lines = yearAheadPromptLines(data);
      reportData = data;
      targetLabel = String(year);
    } else {
      const birthA = validateBirthInput(body.birthA);
      const birthB = validateBirthInput(body.birthB);
      if (!birthA || !birthB) {
        return NextResponse.json({ error: "both charts need complete birth details." }, { status: 400 });
      }
      const data = buildComparisonData(birthA, birthB);
      lines = comparisonPromptLines(data);
      reportData = data;
      targetLabel = "two charts";
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Report calculation failed." },
      { status: 400 }
    );
  }

  const session = await getSession();
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
  const spec = TYPE_PROMPTS[reportType];
  const systemPrompt = `${spec.system}\n\n${SHARED_RULES}\n\n${spec.structure}`;
  const userPrompt = `Report data (positions and signs only, no birth data):\n${lines}\n\nWrite the report now.`;

  // Phase 6 (N5): check the balance BEFORE calling the model.
  // Reports cost 1 Oracle with no free use; a signed-in user with 0
  // credits got a full model call and only then a 402. The spend
  // after generation stays as the atomic enforcement.
  if (session) {
    const preUser = await getUserById(session.userId);
    if (!preUser || preUser.credits < 1) {
      return NextResponse.json(
        { error: "You need 1 Oracle for this report. No Oracle was spent." },
        { status: 402 }
      );
    }
  }

  // One shared client (src/lib/ai.ts): the :free chain, per-model
  // timeout, retry across models, structured failure logging.
  const generated = await generateChat({
    apiKey,
    system: systemPrompt,
    user: userPrompt,
    temperature: 0.8,
    maxTokens: spec.maxTokens,
  });

  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The report could not be generated just now. No Oracle was spent. Please try again in a moment.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  // Server-enforced closings, appended when the model did not include
  // them. Every report carries both, because report content can touch
  // wellbeing and money even though reports have no category flag.
  let finalText = generated.text;
  if (!finalText.includes(HEALTH_CLOSE)) finalText = `${finalText}\n\n${HEALTH_CLOSE}`;
  if (!finalText.includes(FINANCES_CLOSE)) finalText = `${finalText}\n\n${FINANCES_CLOSE}`;

  const report: SavedReport = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: reportType,
    title: reportTitle(reportType, targetLabel),
    targetLabel,
    createdAt: new Date().toISOString(),
    // The full computed data travels with the report, so the saved
    // keep-forever document includes its tables (transit aspects,
    // monthly highlights, cross-aspects), not just the prose. It
    // contains positions and signs only, never birth inputs.
    data: reportData,
    interpretation: finalText,
  };

  // Spend only after a real generation. If the spend fails, the text
  // is withheld rather than delivered unpaid.
  if (session) {
    const ok = await spendUserCredits(session.userId, 1);
    if (!ok) {
      return NextResponse.json(
        { error: "You need 1 Oracle for this report. No Oracle was spent." },
        { status: 402 }
      );
    }
    const user = await getUserById(session.userId);
    return NextResponse.json({
      report,
      model: generated.model,
      fallback: false,
      credits: user?.credits ?? 0,
    });
  }

  return NextResponse.json({
    report,
    model: generated.model,
    fallback: false,
    guest: true,
  });
}
