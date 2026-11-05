import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";
import { localizeStar, zodiacEn } from "@/lib/ziwei-i18n";

/**
 * Static chart-meaning fallback. Phase 2, 2.3: when AI generation
 * fails, the seeker gets this instead of only an error toast. It is
 * deterministic (same chart, same text), built ONLY from the computed
 * placements the chart page already shows, and labelled inside the
 * text itself as a standard interpretation, not AI-generated. It
 * never spends an Oracle and never consumes the free use: it is
 * pre-written, not generated, and the retry button stays available
 * for a personal AI interpretation.
 *
 * Honesty rules, same as the AI prompts: reflection, never guaranteed
 * prediction; only placements that are actually in the result; when
 * birth time is unknown, Rising, Midheaven, and houses are withheld
 * here exactly as they are on the chart itself.
 */

export type ChartResultLike = ZiweiResult | WesternResult | VedicResult;

const HEALTH_CLOSE =
  "This reflection is not medical advice. Please speak with a licensed professional about any health concern.";

// One generic, traditional line per sign. These are standard
// sign themes, not personal claims: the personal part is which
// signs the seeker's own planets fall in.
const SIGN_NOTES: Record<string, string> = {
  Aries: "initiative, directness, and starting before everything is ready",
  Taurus: "steadiness, the senses, and keeping what already works",
  Gemini: "curiosity, words, and holding two ideas at once",
  Cancer: "home, memory, and care for the people close to you",
  Leo: "warmth, pride in good work, and being seen clearly",
  Virgo: "craft, detail, and fixing the system instead of the symptom",
  Libra: "fairness, balance, and the other side of the conversation",
  Scorpio: "depth, focus, and deciding what to keep private",
  Sagittarius: "the bigger picture, honesty, and room to change plans",
  Capricorn: "the long game, structure, and the next solid step",
  Aquarius: "unusual ideas, the group, and rules worth questioning",
  Pisces: "rest, imagination, and knowing where your feelings end",
};

const PLANET_ROLES: Record<string, string> = {
  Sun: "core direction",
  Moon: "emotional weather",
  Mercury: "thinking and words",
  Venus: "what you value and enjoy",
  Mars: "drive and appetite for action",
  Jupiter: "growth and appetite for more",
  Saturn: "structure, limits, and the work that lasts",
  Uranus: "change and the unexpected",
  Neptune: "dreams and what dissolves",
  Pluto: "depth and slow transformation",
};

const ASPECT_NOTES: Record<string, string> = {
  conjunction: "two energies blend into one voice",
  opposition: "a polarity to balance rather than a side to pick",
  square: "friction that asks for work, not a verdict",
  trine: "ease and flow, useful when you use it on purpose",
  sextile: "quiet support that rewards being used",
};

const FOCUS_PROMPTS: Record<string, string> = {
  general: "Which of these placements feels most familiar to you right now, and which one feels like a stranger? Sit with that difference before you draw any conclusion.",
  love: "In your closest relationships, which placement here describes how you give, and which describes what you need to receive? Notice whether the two match.",
  career: "Which placement describes the work you are actually doing, and which describes the work you keep meaning to do? The gap between them is the useful question.",
  finances: "Which placement speaks to how you earn, and which to how you hold on to what you earn? A reflection only: this is not financial advice.",
  academics: "Which placement describes how you learn best, and which describes where study keeps snagging? Start with the snag, one small piece at a time.",
  health: "Which placement speaks to rest and steadiness for you? Treat this as wellness reflection only, never a diagnosis.",
};

function signNote(sign: string): string {
  return SIGN_NOTES[sign] ?? "its own traditional themes";
}

function focusPrompt(focus: string): string {
  return FOCUS_PROMPTS[focus] ?? FOCUS_PROMPTS.general;
}

function westernLines(r: WesternResult): string[] {
  const lines: string[] = [];
  lines.push(`Your Sun is in ${r.sunSign} (${signNote(r.sunSign)}). In a chart the Sun is read as ${PLANET_ROLES.Sun}.`);
  const moon = r.planets.find((p) => p.name === "Moon");
  if (moon) {
    lines.push(`Your Moon is in ${moon.sign} (${signNote(moon.sign)}). The Moon is read as ${PLANET_ROLES.Moon}.`);
  }
  if (!r.unknownTime && r.ascendantSign) {
    lines.push(`Your Rising sign is ${r.ascendantSign} (${signNote(r.ascendantSign)}): the way you meet the day, rather than the day itself.`);
  }
  const others = r.planets.filter((p) => p.name !== "Sun" && p.name !== "Moon");
  if (others.length) {
    lines.push(
      "The rest of the planets: " +
        others
          .map(
            (p) =>
              `${p.name} in ${p.sign} (${PLANET_ROLES[p.name] ?? "its own sphere"}${p.retrograde ? ", retrograde" : ""}${typeof p.house === "number" ? `, house ${p.house}` : ""})`
          )
          .join("; ") +
        "."
    );
  }
  if (r.aspects.length) {
    lines.push(
      "Aspects between planets: " +
        r.aspects
          .map(
            (a) =>
              `${a.planet1} ${a.label} ${a.planet2} (${ASPECT_NOTES[a.label.toLowerCase()] ?? "a meeting of two energies"})`
          )
          .join("; ") +
        "."
    );
  }
  return lines;
}

function vedicLines(r: VedicResult): string[] {
  const lines: string[] = [];
  lines.push(`Your Sun is in ${r.sunSign} (${signNote(r.sunSign)}), sidereal, and your Moon is in ${r.moonSign} (${signNote(r.moonSign)}).`);
  lines.push(`Your Moon sits in the ${r.moonNakshatra} nakshatra, pada ${r.moonNakshatraPada}, ruled by ${r.moonNakshatraLord}: in this system the Moon's mansion is read as the emotional ground the rest of the chart stands on.`);
  if (!r.unknownTime && r.ascendantSign) {
    lines.push(`Your Rising sign (Lagna) is ${r.ascendantSign} (${signNote(r.ascendantSign)}).`);
  }
  lines.push(`Your current Vimshottari mahadasha is ${r.currentDasha}${r.currentAntardasha ? `, with the ${r.currentAntardasha.lord} antardasha running inside it` : ""}. A dasha names the current chapter, not a guaranteed event.`);
  const planets = r.planets.filter((p) => p.name !== "Sun" && p.name !== "Moon");
  if (planets.length) {
    lines.push(
      "The rest of the planets: " +
        planets
          .map((p) => `${p.name} in ${p.sign}${typeof p.house === "number" ? `, house ${p.house}` : ""}`)
          .join("; ") +
        "."
    );
  }
  return lines;
}

function ziweiLines(r: ZiweiResult): string[] {
  const lines: string[] = [];
  const life = r.palaces.find((p) => p.isLifePalace);
  const lifeStars = (life?.majorStars ?? []).map((s) => localizeStar(s).en).join(", ") || "empty";
  lines.push(
    `Your Life palace holds ${lifeStars}. Your zodiac animal is ${zodiacEn(r.zodiac)}. In Ziwei the Life palace is read as the ground of the chart: how you meet life, not what life will do to you.`
  );
  const nonEmpty = r.palaces.filter((p) => !p.isLifePalace && p.majorStars.length > 0);
  if (nonEmpty.length) {
    lines.push(
      "The other palaces: " +
        nonEmpty
          .map(
            (p) =>
              `${p.name} holds ${(p.majorStarsDetail.length ? p.majorStarsDetail : p.majorStars.map((s) => ({ name: s }))).map((d) => {
                const star = d as { name: string; brightness?: string; mutagen?: string };
                const b = star.brightness ? ` (${star.brightness})` : "";
                const t = star.mutagen ? ` [${star.mutagen}]` : "";
                return `${localizeStar(star.name).en}${b}${t}`;
              }).join(", ")}`
          )
          .join("; ") +
        "."
    );
  }
  return lines;
}

export function buildStaticChartInterpretation(
  result: ChartResultLike,
  focus: string
): string {
  const systemName =
    result.system === "ziwei"
      ? "Ziwei"
      : result.system === "vedic"
        ? "Vedic"
        : "Western";
  const body =
    result.system === "western"
      ? westernLines(result)
      : result.system === "vedic"
        ? vedicLines(result)
        : ziweiLines(result);
  const parts = [
    "Standard interpretation — prepared from your chart positions, not written by AI.",
    `This is a standard reading of your ${systemName} chart for ${focus}, built from the placements above. The personal AI interpretation could not be generated just now; nothing was spent, and your free interpretation for this system is still unused if you had one. You can retry for the personal version above.`,
    ...body,
    focusPrompt(focus),
    "Readings are for reflection and perspective, not guaranteed predictions. Take what resonates, leave the rest.",
  ];
  if (focus === "health") parts.push(HEALTH_CLOSE);
  return parts.join("\n\n");
}
