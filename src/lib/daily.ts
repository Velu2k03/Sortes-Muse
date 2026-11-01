// Daily sun-sign horoscope, written in-house for Sortes, no scraped text,
// no external API. Aztro (sameerkumar18/aztro) was checked live on
// 2026-11-01 and did not respond from this environment (curl HTTP 000),
// and its text is generic sun-sign copy, so Sortes does not depend on it.
// The daily text is a dated, clearly labelled general reflection: one
// per-sign theme (original, reflection-framed, never a guaranteed
// prediction, never medical or financial advice) plus a rotating daily
// reflection line, a deterministic lucky colour, and a lucky number.
// Nothing here is a personal reading and nothing is charged.
export const SUN_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;
export type SunSign = (typeof SUN_SIGNS)[number];

const SIGN_THEMES: Record<SunSign, string> = {
  Aries: "Energy is easier to spend than to aim today. Point it at one thing before the day points it at everything.",
  Taurus: "A small, steady choice today is worth more than a grand plan. Keep what is already working, and tend it.",
  Gemini: "Two good ideas are competing for your attention. Write both down, then follow the one you can finish today.",
  Cancer: "Home and habit are doing quiet work for you. Protect one calm hour, and let the rest of the day be ordinary.",
  Leo: "Being seen matters less than being clear. Say the simple version of what you want, and let it stand.",
  Virgo: "A detail you have been circling is ready to be settled. Fix it, file it, and free the rest of your attention.",
  Libra: "Balance today is a practice, not a verdict. Adjust one small thing, then check how it feels before adjusting more.",
  Scorpio: "Something you have been holding deserves a decision, even a small one. Name it, and the next step gets easier.",
  Sagittarius: "A bigger picture is tempting, but today rewards a short walk in one direction. Start small and see where it leads.",
  Capricorn: "The long game is already in motion. Today's job is the next solid step, not the whole staircase at once.",
  Aquarius: "An unusual idea is worth a test, not a commitment. Try it in miniature and watch what actually happens.",
  Pisces: "Rest is not the opposite of progress today. One quiet pause may be what lets the next idea arrive cleanly.",
};

const DAILY_LINES = [
  "Notice what you keep returning to today. That pull is information, not a command.",
  "If a conversation feels stuck, try the shorter, kinder version of what you mean.",
  "A plan made yesterday can be revised today without it being a failure. Revision is part of the work.",
  "Pay attention to the first hour of the day. It often sets the tone the rest of the day follows.",
  "Something unfinished is not a verdict on you. Pick the smallest next move and take only that one.",
  "Other people may not see the effort you are putting in. Do it for the result, not the applause.",
  "Today is a good day to finish something small and let that finished feeling carry forward.",
];

const LUCKY_COLOURS = [
  "Gold",
  "Deep blue",
  "Sage green",
  "Warm cream",
  "Terracotta",
  "Soft violet",
  "Charcoal",
  "Sky blue",
  "Forest green",
  "Rose",
  "Sand",
  "Silver",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function dayOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

export interface DailyHoroscope {
  sign: SunSign;
  date: string;
  theme: string;
  reflection: string;
  luckyColour: string;
  luckyNumber: number;
}

export function dailyHoroscope(sign: SunSign, date: string): DailyHoroscope {
  const h = hashString(`${sign}|${date}`);
  const doy = dayOfYear(date);
  return {
    sign,
    date,
    theme: SIGN_THEMES[sign],
    reflection: DAILY_LINES[doy % DAILY_LINES.length],
    luckyColour: LUCKY_COLOURS[(h + doy) % LUCKY_COLOURS.length],
    luckyNumber: (h % 9) + 1,
  };
}

export function isSunSign(v: string): v is SunSign {
  return (SUN_SIGNS as readonly string[]).includes(v);
}
