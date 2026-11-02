import { NextRequest, NextResponse } from "next/server";
import { localizeStar } from "@/lib/ziwei-i18n";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeInterpretation,
  markFreeInterpretationUsed,
} from "@/lib/db";

// Chart interpretation, Phase 2. Reuses the tarot OpenRouter pattern
// (same model fallback chain, same timeout) but is a separate route
// because its payload is chart positions, not tarot cards and intake.
// Privacy is enforced by construction: the prompt is built ONLY from
// the whitelisted position fields below. The client sends the
// calculation result object, which contains no birth date, time,
// coordinates, or place name (Western and Vedic results carry no birth
// data at all; Ziwei results carry a solar date only, which is
// deliberately NOT copied into the prompt). Any extra keys in the
// request are ignored.
//
// M0.1 credit authority: for signed-in users this route is the
// enforcement point. First interpretation per system is free, recorded
// server-side (free_interpretations table); later ones spend 1 credit
// server-side AFTER a real model generates text, so a failed generation
// can never cost a credit and no refund path is needed. Guests keep the
// existing device-local free flags and wallet, because guests have no
// server account to charge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25000;
const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";

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

const CATEGORIES = ["general", "love", "career", "finances", "academics", "health"] as const;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Build the prompt ONLY from whitelisted position fields. Returns null
// when the chart shape is not recognisable for its system.
function buildChartLines(system: string, chart: Record<string, unknown>): string | null {
  if (system === "ziwei") {
    const palaces = Array.isArray(chart.palaces) ? chart.palaces : [];
    if (palaces.length !== 12) return null;
    const lines = palaces.map((raw) => {
      const p = raw as Record<string, unknown>;
      const majors = Array.isArray(p.majorStars) ? (p.majorStars as unknown[]).map((s) => {
        const l = localizeStar(String(s));
        return `${l.en} (${l.zh})`;
      }) : [];
      const life = p.isLifePalace === true ? " [Life palace]" : "";
      return `- ${str(p.name)} palace${life}: ${majors.length ? majors.join(", ") : "empty"}`;
    });
    return `System: Ziwei (Purple Star), 12 palaces.\nZodiac animal: ${str(chart.zodiac)}. Western sign: ${str(chart.sign)}.\n${lines.join("\n")}`;
  }
  if (system === "western") {
    const planets = Array.isArray(chart.planets) ? chart.planets : [];
    if (!planets.length) return null;
    const lines = planets.map((raw) => {
      const p = raw as Record<string, unknown>;
      const lon = num(p.longitude);
      return `- ${str(p.name)}: ${str(p.sign)}${lon !== null ? `, ${lon.toFixed(2)} degrees` : ""}${typeof p.house === "number" ? `, house ${p.house}` : ""}`;
    });
    return `System: Western tropical.\nSun: ${str(chart.sunSign)}. Rising: ${str(chart.ascendantSign)}. Midheaven: ${str(chart.midheavenSign)}.\n${lines.join("\n")}`;
  }
  if (system === "vedic") {
    const planets = Array.isArray(chart.planets) ? chart.planets : [];
    if (!planets.length) return null;
    const lines = planets.map((raw) => {
      const p = raw as Record<string, unknown>;
      const lon = num(p.longitude);
      return `- ${str(p.name)}: ${str(p.sign)}${lon !== null ? `, ${lon.toFixed(2)} degrees` : ""}${typeof p.house === "number" ? `, house ${p.house}` : ""}`;
    });
    return `System: Vedic (Jyotish), sidereal Lahiri, whole-sign houses.\nSun: ${str(chart.sunSign)}. Moon: ${str(chart.moonSign)}. Rising: ${str(chart.ascendantSign)}.\nMoon nakshatra: ${str(chart.moonNakshatra)}, pada ${str(chart.moonNakshatraPada)}, lord ${str(chart.moonNakshatraLord)}.\nCurrent Vimshottari dasha: ${str(chart.currentDasha)}.\n${lines.join("\n")}`;
  }
  return null;
}

/**
 * Free-status check for signed-in users, so the client button label
 * ("free" vs "1 credit") matches what the server will actually do.
 * Guests do not call this; they use their device-local flags.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const system = new URL(req.url).searchParams.get("system");
  if (system !== "ziwei" && system !== "western" && system !== "vedic") {
    return NextResponse.json({ error: "system must be ziwei, western, or vedic." }, { status: 400 });
  }
  const used = await hasUsedFreeInterpretation(session.userId, system);
  return NextResponse.json({ free: !used });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many interpretations right now. Please try again later." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const system = body.system;
  if (system !== "ziwei" && system !== "western" && system !== "vedic") {
    return NextResponse.json({ error: "system must be ziwei, western, or vedic." }, { status: 400 });
  }
  const chart = body.chart;
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
    return NextResponse.json({ error: "chart positions are required." }, { status: 400 });
  }
  const lines = buildChartLines(system, chart as Record<string, unknown>);
  if (!lines) {
    return NextResponse.json({ error: "chart positions are incomplete for this system." }, { status: 400 });
  }
  const categoryRaw = typeof body.category === "string" ? body.category : "general";
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : "general";
  const question = typeof body.question === "string" ? body.question.slice(0, 300).trim() : "";
  const isHealth = category === "health";
  const healthGuard = isHealth
    ? `HEALTH GUARDRAIL: This is general wellness reflection ONLY. Never diagnose any condition, never name a disease or disorder, never predict medical outcomes, never suggest medication or dosage. Always close with this exact sentence: "${HEALTH_CLOSE}"`
    : "";

  const systemPrompt = `You are Sortes, a warm and thoughtful chart reader inside a reflective astrology app. You write personal chart reflections from positions only.

Rules you must always follow:
- Frame everything as reflection and perspective, NEVER as guaranteed prediction. Never claim certainty about the future. Use language like "this may invite you to consider", "a mirror for", "worth sitting with".
- Weave the chart placements into the seeker's focus area (${category}) and question, without inventing facts about them beyond the chart and question.
- Keep the reflection 350-550 words. Structure: a short opening that names their focus, one section per key placement group, then a closing reflection with one gentle question for them to sit with.
- Never moralize, never repeat the question back verbatim.
- Write the entire reflection in English.
${healthGuard}`;

  const userPrompt = `Focus area: ${category}
${question ? `The seeker's question:\n${question}\n` : ""}
Chart positions (positions and signs only, no birth data):
${lines}

Write the personalized chart reflection now.`;

  // M0.1: read the session before generation, but spend or mark free
  // only after a real model succeeds (see below). Guests skip this
  // block entirely and keep their device-local wallet.
  const session = await getSession();
  const serverFree = session ? !(await hasUsedFreeInterpretation(session.userId, system)) : false;

  const apiKey = process.env.OPENROUTER_API_KEY;
  // No key configured: fail honestly instead of serving static text.
  // No credit is spent and no free use is marked on this path.
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
  const modelList = (
    process.env.OPENROUTER_MODEL ||
    "google/gemini-2.5-flash-preview:free,xiaomi/mimo-v2-flash:free,meta-llama/llama-3.3-70b-instruct:free"
  ).split(",").map((s) => s.trim()).filter(Boolean);

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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 1200,
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
      const data = await res.json();
      const text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty model response");
      clearTimeout(timer);
      generated = { text, model: data?.model ?? model };
      break;
    } catch {
      clearTimeout(timer);
    }
  }

  // Every model failed: fail honestly. A paying user must never pay
  // for static text, so no static fallback is served here, no credit
  // is spent, and no free use is marked on this path.
  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The interpretation could not be generated just now. No credit was spent. Please try again in a moment.",
        fallback: true,
      },
      { status: 503 }
    );
  }

  const finalText = isHealth && !generated.text.includes(HEALTH_CLOSE)
    ? `${generated.text}\n\n${HEALTH_CLOSE}`
    : generated.text;

  // Spend or mark free only after a real generation, so a failed
  // generation can never cost a credit or consume the free use. If
  // the spend fails, the text is withheld rather than delivered unpaid.
  if (session) {
    if (serverFree) {
      await markFreeInterpretationUsed(session.userId, system);
    } else {
      const ok = await spendUserCredits(session.userId, 1);
      if (!ok) {
        return NextResponse.json(
          { error: "You need 1 credit for this interpretation. No credit was spent." },
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
  });
}
