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
// M1.2: aspects, cusps, retrograde, Ziwei brightness and
// transformations, and Vedic dasha dates are now included, and
// unknown-time charts omit angles and houses instead of receiving
// noon-derived ones.
const UNKNOWN_TIME_NOTE =
  "Birth time unknown: planet positions use a noon stand-in, and Rising and houses are withheld and must not be interpreted.";
const UNKNOWN_TIME_NOTE_WESTERN =
  "Birth time unknown: planet positions use a noon stand-in, and Rising, Midheaven, and houses are withheld and must not be interpreted.";

function planetLine(p: Record<string, unknown>): string {
  const lon = num(p.longitude);
  return `- ${str(p.name)}: ${str(p.sign)}${lon !== null ? `, ${lon.toFixed(2)} degrees` : ""}${typeof p.house === "number" ? `, house ${p.house}` : ""}${p.retrograde === true ? ", retrograde" : ""}`;
}

// Ziwei brightness and transformation glosses. Raw characters stay in
// the prompt; the gloss only helps the model read them.
const BRIGHTNESS_EN: Record<string, string> = {
  "庙": "exalted",
  "旺": "flourishing",
  "得": "favorable",
  "利": "beneficial",
  "平": "neutral",
  "陷": "debilitated",
};
const MUTAGEN_EN: Record<string, string> = {
  "禄": "Lu (growth)",
  "权": "Quan (authority)",
  "科": "Ke (recognition)",
  "忌": "Ji (obstacle)",
};

function buildChartLines(system: string, chart: Record<string, unknown>): string | null {
  const unknownTime = chart.unknownTime === true;
  if (system === "ziwei") {
    const palaces = Array.isArray(chart.palaces) ? chart.palaces : [];
    if (palaces.length !== 12) return null;
    const lines = palaces.map((raw) => {
      const p = raw as Record<string, unknown>;
      const majors = Array.isArray(p.majorStars) ? (p.majorStars as unknown[]).map((s) => {
        const l = localizeStar(String(s));
        return `${l.en} (${l.zh})`;
      }) : [];
      // Brightness and transformations come from majorStarsDetail
      // when the calculation provides it; they are never invented.
      const details = Array.isArray(p.majorStarsDetail) ? p.majorStarsDetail : [];
      const detailLines = details.map((rawD) => {
        const d = rawD as Record<string, unknown>;
        const l = localizeStar(str(d.name));
        const brightness = str(d.brightness);
        const mutagen = str(d.mutagen);
        const b = brightness ? `, brightness ${brightness}${BRIGHTNESS_EN[brightness] ? ` (${BRIGHTNESS_EN[brightness]})` : ""}` : "";
        const t = mutagen ? `, transformation ${mutagen}${MUTAGEN_EN[mutagen] ? ` (${MUTAGEN_EN[mutagen]})` : ""}` : "";
        return `${l.en} (${l.zh})${b}${t}`;
      });
      const minors = Array.isArray(p.minorStars) ? (p.minorStars as unknown[]).map((s) => localizeStar(String(s)).en) : [];
      const life = p.isLifePalace === true ? " [Life palace]" : "";
      const majorText = detailLines.length ? detailLines.join("; ") : majors.length ? majors.join(", ") : "empty";
      const minorText = minors.length ? `; minor stars: ${minors.join(", ")}` : "";
      return `- ${str(p.name)} palace${life}: ${majorText}${minorText}`;
    });
    return `System: Ziwei (Purple Star), 12 palaces.\nZodiac animal: ${str(chart.zodiac)}. Western sign: ${str(chart.sign)}.\n${lines.join("\n")}`;
  }
  if (system === "western") {
    const planets = Array.isArray(chart.planets) ? chart.planets : [];
    if (!planets.length) return null;
    const lines = planets.map((raw) => planetLine(raw as Record<string, unknown>));
    const header = unknownTime
      ? `Sun: ${str(chart.sunSign)}. ${UNKNOWN_TIME_NOTE_WESTERN}`
      : `Sun: ${str(chart.sunSign)}. Rising: ${str(chart.ascendantSign)}. Midheaven: ${str(chart.midheavenSign)}.`;
    const cusps = Array.isArray(chart.cusps) ? chart.cusps : [];
    const cuspLines = cusps.length === 12
      ? `\nHouse cusps (Placidus, degrees): ${cusps.map((c, i) => `house ${i + 1} ${num(c)?.toFixed(2) ?? "?"}`).join(", ")}.`
      : "";
    const aspects = Array.isArray(chart.aspects) ? chart.aspects : [];
    const aspectLines = aspects.length
      ? `\nAspects:\n${aspects.map((raw) => {
        const a = raw as Record<string, unknown>;
        const orb = num(a.orb);
        return `- ${str(a.planet1)} ${str(a.label)} ${str(a.planet2)}${orb !== null ? `, orb ${orb.toFixed(2)} degrees` : ""}`;
      }).join("\n")}`
      : "";
    return `System: Western tropical.\n${header}\n${lines.join("\n")}${cuspLines}${aspectLines}`;
  }
  if (system === "vedic") {
    const planets = Array.isArray(chart.planets) ? chart.planets : [];
    if (!planets.length) return null;
    const lines = planets.map((raw) => planetLine(raw as Record<string, unknown>));
    const header = unknownTime
      ? `Sun: ${str(chart.sunSign)}. Moon: ${str(chart.moonSign)}. ${UNKNOWN_TIME_NOTE}`
      : `Sun: ${str(chart.sunSign)}. Moon: ${str(chart.moonSign)}. Rising: ${str(chart.ascendantSign)}.`;
    const timeline = Array.isArray(chart.dashaTimeline) ? chart.dashaTimeline : [];
    const timelineLines = timeline.length
      ? `\nMahadasha timeline (Vimshottari, dates YYYY-MM-DD):\n${timeline.map((raw) => {
        const t = raw as Record<string, unknown>;
        return `- ${str(t.lord)}: ${str(t.start)} to ${str(t.end)}`;
      }).join("\n")}`
      : "";
    const antar = chart.currentAntardasha as Record<string, unknown> | undefined;
    const antarLine = antar && str(antar.lord)
      ? `\nCurrent antardasha: ${str(antar.lord)}, ${str(antar.start)} to ${str(antar.end)}.`
      : "";
    return `System: Vedic (Jyotish), sidereal Lahiri, whole-sign houses.\n${header}\nMoon nakshatra: ${str(chart.moonNakshatra)}, pada ${str(chart.moonNakshatraPada)}, lord ${str(chart.moonNakshatraLord)}.\nCurrent Vimshottari dasha: ${str(chart.currentDasha)}.${timelineLines}${antarLine}\n${lines.join("\n")}`;
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
- When a star transformation or brightness, an aspect, a cusp, a retrograde flag, or a dasha date is given, name it as given. Never invent a transformation, brightness, aspect, house placement, or date that is not in the chart positions. When birth time is unknown, never mention houses, Rising, or Midheaven.
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
