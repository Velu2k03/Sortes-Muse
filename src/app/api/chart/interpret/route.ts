import { NextRequest, NextResponse } from "next/server";
import { localizeStar } from "@/lib/ziwei-i18n";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeInterpretation,
  markFreeInterpretationUsed,
} from "@/lib/db";
import { generateChat } from "@/lib/ai";
import { validateChartText, anchorTerms } from "@/lib/output-validation";
import { logGuestGeneration } from "@/lib/guestLogging";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

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

const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";

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
        const state = typeof a.state === "string" ? a.state : "";
        return `- ${str(a.planet1)} ${str(a.label)} ${str(a.planet2)}${orb !== null ? `, orb ${orb.toFixed(2)} degrees` : ""}${state ? `, ${state}` : ""}`;
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
    const praty = chart.currentPratyantar as Record<string, unknown> | undefined;
    const pratyLine = praty && str(praty.lord)
      ? `\nCurrent pratyantar: ${str(praty.lord)}, ${str(praty.start)} to ${str(praty.end)}.`
      : "";
    const ayanamsaLine = typeof chart.ayanamsaDegrees === "number"
      ? `\nAyanamsa (Lahiri) for this birth date: ${chart.ayanamsaDegrees.toFixed(4)} degrees.`
      : "";
    // Phase E (item 5): only the computed yogas are sent, with
    // their conditions, so the model names them as given and never
    // invents yogas. Ashtakavarga is sent the same way when computed:
    // the SAV row plus each planet's own bindus in the sign it
    // occupies, read as relative strength only, never as a verdict,
    // and with no reductions (none are computed).
    const yogas = Array.isArray(chart.yogas) ? chart.yogas : [];
    const yogaLines = yogas.length
      ? `\nNamed yogas computed from this chart (name only the ones listed, with their conditions as given; never invent other yogas):\n${yogas.map((raw) => {
        const y = raw as Record<string, unknown>;
        return `- ${str(y.name)}: ${str(y.detail)}`;
      }).join("\n")}`
      : "\nNo named yogas from the classical set were found in this chart; do not invent any.";
    const av = chart.ashtakavarga as Record<string, unknown> | undefined;
    const sav = Array.isArray(av?.sav) ? (av.sav as unknown[]) : [];
    const natal = (av?.natalBindus ?? {}) as Record<string, unknown>;
    const avLines = sav.length === 12
      ? `\nAshtakavarga (unreduced BAV/SAV, computed from this chart; read as relative strength, never as a verdict; no reductions are computed):\nSarvashtakavarga per house 1-12: ${sav.map((n) => String(n)).join(", ")} (total 337).\nEach planet's own bindus in the sign it occupies: ${["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"].map((p) => `${p} ${String(natal[p] ?? "?")}`).join(", ")} (4 is the neutral point).`
      : "\nAshtakavarga is not computed for this chart (no birth time); do not mention it.";
    return `System: Vedic (Jyotish), sidereal Lahiri, whole-sign houses.\n${header}\nMoon nakshatra: ${str(chart.moonNakshatra)}, pada ${str(chart.moonNakshatraPada)}, lord ${str(chart.moonNakshatraLord)}.\nCurrent Vimshottari dasha: ${str(chart.currentDasha)}.${timelineLines}${antarLine}${pratyLine}${ayanamsaLine}${yogaLines}${avLines}\n${lines.join("\n")}`;
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
  // Phase 6: shared limiter (was a per-route map: 20/hr/IP).
  if (!checkRateLimit(`interpret:${clientIp(req)}`, RATE_LIMITS.chartInterpretIp).allowed) {
    return rateLimitExceeded();
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
  // Phase 2, 2.4: over-long questions are rejected, not silently
  // truncated, so the seeker knows their question was not fully read.
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length > 300) {
    return NextResponse.json(
      { error: "Question must be 300 characters or fewer." },
      { status: 400 }
    );
  }
  const isHealth = category === "health";
  const healthGuard = isHealth
    ? `HEALTH GUARDRAIL: This is general wellness reflection ONLY. Never diagnose any condition, never name a disease or disorder, never predict medical outcomes, never suggest medication or dosage. Always close with this exact sentence: "${HEALTH_CLOSE}"`
    : "";

  const systemPrompt = `You are Sortes, a warm and thoughtful chart reader inside a reflective astrology app. You write personal chart reflections from positions only.

Rules you must always follow:
- Frame everything as reflection and perspective, NEVER as guaranteed prediction. Never claim certainty about the future. Use language like "this may invite you to consider", "a mirror for", "worth sitting with".
- Weave the chart placements into the seeker's focus area (${category}) and question, without inventing facts about them beyond the chart and question.
- When a star transformation or brightness, an aspect, a cusp, a retrograde flag, or a dasha date is given, name it as given. Never invent a transformation, brightness, aspect, house placement, or date that is not in the chart positions. When birth time is unknown, never mention houses, Rising, or Midheaven.
- In a Ziwei chart, minor stars are placed by birth month or year alone, so they describe a whole cohort, not this person: mention them only as background, and never let a minor star carry a personal verdict. Personal claims must rest on major stars, palaces, and transformations only.
- Keep the reflection 350-550 words. Structure: a short opening that names their focus and question, one section per key placement group, then a closing section that answers their focus directly, in this order: what stands out in these placements for their focus; the tension or opportunity between placements; what they may be overlooking; one practical step they could take, small and concrete, never medical or financial advice; and exactly one gentle question for them to sit with. Every closing point must tie back to their focus, their question, or a named placement, never a generic paragraph that could fit any chart.
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
          "AI generation is not configured on this server right now. No Oracle was spent. Please try again later.",
        fallback: true,
      },
      { status: 503 }
    );
  }
  // Phase 6 (N5): check the balance BEFORE calling the model. A
  // signed-in user with 0 credits and no free use got a full model
  // call and only then a 402 — wasted quota on every attempt. The
  // spend after generation stays as the atomic enforcement; this is
  // the early, quota-saving check.
  if (session && !serverFree) {
    const preUser = await getUserById(session.userId);
    if (!preUser || preUser.credits < 1) {
      return NextResponse.json(
        { error: "You need 1 Oracle for this interpretation. No Oracle was spent." },
        { status: 402 }
      );
    }
  }
  // One shared client (src/lib/ai.ts): the :free chain, per-model
  // timeout, retry across models, structured failure logging.
  // Phase E (item 1): the output is validated the same way the tarot
  // route validates a reading: the prompted 350-550 word band
  // (accepted 300-600), at least two anchors named back from the
  // chart lines (a planet, sign, palace, or date), and the closing
  // question the prompt requires. The guardrail sentence is not
  // checked here: the route appends it server-side after generation,
  // so the delivered text always carries it. Invalid text is
  // discarded and the next model is tried, exactly as in the tarot
  // route; if no model validates, the route fails honestly with no
  // spend.
  const generated = await generateChat({
    apiKey,
    system: systemPrompt,
    user: userPrompt,
    temperature: 0.8,
    maxTokens: 1200,
    validate: (text) => validateChartText(text, { anchors: anchorTerms(lines) }),
    route: "chart/interpret",
  });

  // Every model failed: fail honestly. A paying user must never pay
  // for static text, so no static fallback is served here, no credit
  // is spent, and no free use is marked on this path.
  if (!generated) {
    return NextResponse.json(
      {
        error:
          "The interpretation could not be generated just now. No Oracle was spent. Please try again in a moment.",
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
  //
  // Phase B (R7): the free claim is atomic. markFreeInterpretationUsed
  // returns false when a concurrent request claimed the free use
  // first; that request spends one Oracle instead of serving a
  // second free interpretation, and the response reports free: false
  // because the interpretation was paid for.
  let freeGranted = serverFree;
  if (session) {
    if (serverFree) {
      const claimed = await markFreeInterpretationUsed(session.userId, system);
      if (!claimed) {
        freeGranted = false;
        const ok = await spendUserCredits(session.userId, 1);
        if (!ok) {
          return NextResponse.json(
            { error: "You need 1 Oracle for this interpretation. No Oracle was spent." },
            { status: 402 }
          );
        }
      }
    } else {
      const ok = await spendUserCredits(session.userId, 1);
      if (!ok) {
        return NextResponse.json(
          { error: "You need 1 Oracle for this interpretation. No Oracle was spent." },
          { status: 402 }
        );
      }
    }
    const user = await getUserById(session.userId);
    return NextResponse.json({
      interpretation: finalText,
      model: generated.model,
      fallback: false,
      free: freeGranted,
      credits: user?.credits ?? 0,
    });
  }

  // Phase B (R6): guest generation is free by design (top of
  // funnel); the successful generation is logged so abuse is
  // visible per route in the log drain.
  logGuestGeneration("chart/interpret");
  return NextResponse.json({
    interpretation: finalText,
    model: generated.model,
    fallback: false,
  });
}
