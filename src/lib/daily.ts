// Daily sun-sign horoscope, written in-house for Sortes, no scraped text,
// no external API. Aztro (sameerkumar18/aztro) was checked live on
// 2026-11-01 and did not respond from this environment (curl HTTP 000),
// and its text is generic sun-sign copy, so Sortes does not depend on it.
// The daily text is a dated, clearly labelled general reflection: seven
// rotating per-sign themes (original, reflection-framed, never a guaranteed
// prediction, never medical or financial advice) plus a rotating daily
// reflection line. Nothing here is a personal reading and nothing is
// charged. Phase 3 (3.9): the lucky colour and lucky number picks are
// deleted — deterministic hash picks dressed as fortune-telling, not
// reflection. What remains is the honest reflection text only.
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

const SIGN_THEMES: Record<SunSign, string[]> = {
  Aries: [
    "Energy is easier to spend than to aim today. Point it at one thing before the day points it at everything.",
    "Starting before you feel ready is fine, as long as the first step is small enough to finish.",
    "A direct question today can save three rounds of guessing. Ask it plainly.",
    "Restlessness is information, not a flaw. Give it a task with a clear end.",
    "Someone else's urgency does not have to become yours. Check what is actually due today.",
    "Courage today looks like patience: waiting one more beat before reacting.",
    "Finish the thing you started yesterday before opening a new front.",
  ],
  Taurus: [
    "A small, steady choice today is worth more than a grand plan. Keep what is already working, and tend it.",
    "Comfort is a tool, not a trap. Use it to steady yourself, then do the harder thing.",
    "A routine you keep is a promise you make to yourself. Keep one today.",
    "Slow down the decision, not the day. One careful choice beats three rushed ones.",
    "Something you own deserves a second look. Keep it, fix it, or let it go on purpose.",
    "Good food, fresh air, and a finished task. That is enough of a plan for today.",
    "Change arrives gradually. Notice the small shift instead of waiting for the big one.",
  ],
  Gemini: [
    "Two good ideas are competing for your attention. Write both down, then follow the one you can finish today.",
    "Say it in half the words. The shorter version is usually the clearer one.",
    "Curiosity is useful when it has a destination. Pick one question and follow it through.",
    "A conversation today works better as listening than as debating. Try hearing the whole thought first.",
    "Variety is fine, but scattering is not. Choose one thread and pull it to the end.",
    "Write the idea down before it evaporates. Paper remembers what mornings forget.",
    "Two conversations, one decision. Let the second one wait until the first is settled.",
  ],
  Cancer: [
    "Home and habit are doing quiet work for you. Protect one calm hour, and let the rest of the day be ordinary.",
    "Care for one person today, including yourself. Small kindnesses count double when they are specific.",
    "A memory is visiting for a reason. Notice what it points to, then return to the present.",
    "Your home reflects your head. Tidy one corner and see if the rest follows.",
    "Saying no to one request protects the yes you already gave. Guard it kindly.",
    "A quiet evening is not a wasted evening. Rest is part of the plan, not a delay of it.",
    "Check in on someone you have been meaning to call. Short and sincere beats long and postponed.",
  ],
  Leo: [
    "Being seen matters less than being clear. Say the simple version of what you want, and let it stand.",
    "Praise given freely today builds trust. Name one thing someone did well.",
    "The stage can wait. Do the unglamorous work first and let the results speak.",
    "Generosity with credit costs nothing and builds more than applause does.",
    "A bold move needs a quiet reason behind it. Know yours before you make it.",
    "Let someone else have the spotlight today. Watching well is also a skill.",
    "Confidence is keeping a promise to yourself when no one is watching.",
  ],
  Virgo: [
    "A detail you have been circling is ready to be settled. Fix it, file it, and free the rest of your attention.",
    "Good enough today is genuinely good enough. Release the draft and move on.",
    "A list with three items beats a list with thirty. Shorten it, then start at the top.",
    "Help offered plainly lands better than help wrapped in criticism. Offer the first kind.",
    "Your standards are a gift when they serve you and a weight when they rule you. Check which one today is.",
    "One system, fixed properly, saves ten future apologies. Fix the system.",
    "Notice what is already working before hunting for what is broken.",
  ],
  Libra: [
    "Balance today is a practice, not a verdict. Adjust one small thing, then check how it feels before adjusting more.",
    "A fair decision is not always a popular one. Make it anyway, and explain it once.",
    "Beauty in small things counts: a clear desk, a good cup, an honest sentence.",
    "Diplomacy is not the same as avoidance. Say the hard part gently and directly.",
    "Two sides both have a point. Hold both without rushing to pick a winner.",
    "An agreement written down outlasts an agreement remembered. Write it down.",
    "Your own preference matters too. Name it before you negotiate it away.",
  ],
  Scorpio: [
    "Something you have been holding deserves a decision, even a small one. Name it, and the next step gets easier.",
    "Privacy is a boundary, not a secret. Keep what is yours without apology.",
    "Intensity focused on one task is power. Scattered, it is only noise.",
    "Let one thing go today, on purpose, and notice how much lighter the rest feels.",
    "Trust is built in small deposits. Make one today and expect nothing back immediately.",
    "A question asked honestly gets a better answer than a test disguised as one.",
    "Depth is not the same as difficulty. The simple version of the truth is still the truth.",
  ],
  Sagittarius: [
    "A bigger picture is tempting, but today rewards a short walk in one direction. Start small and see where it leads.",
    "Honesty without kindness is just bluntness. Add the kindness and keep the honesty.",
    "A plan with room to change is stronger than a plan that must not. Leave one gap.",
    "Learn one thing properly instead of skimming ten. Depth beats breadth today.",
    "Wander with a destination, even a small one. Aimless and free are different things.",
    "A promise kept late is still a promise kept. Finish it today.",
    "Optimism works best with a checklist. Pair the big hope with one small action.",
  ],
  Capricorn: [
    "The long game is already in motion. Today's job is the next solid step, not the whole staircase at once.",
    "Rest is not laziness, it is maintenance. Schedule it like any other task.",
    "A reputation is built from Tuesday habits, not grand gestures. Mind the Tuesday.",
    "Ask for help before you need it badly. Early help is easier to give.",
    "Measure progress by what is done, not by what is left. The list shrinks either way.",
    "One boundary held today saves a week of resentment. Hold it calmly.",
    "Ambition needs a finish line for today, not just for the year. Set it.",
  ],
  Aquarius: [
    "An unusual idea is worth a test, not a commitment. Try it in miniature and watch what actually happens.",
    "A group works when someone states the obvious problem. That someone can be you.",
    "Principles are easy to hold in general. Apply one to a specific case today.",
    "Different is not difficult. Try the unfamiliar route and judge it by results.",
    "Share the idea before it is perfect. Early feedback beats late polish.",
    "Alone time is not rejection. Take the hour you need and return clearer.",
    "Change one rule that no longer serves anyone, starting with your own habits.",
  ],
  Pisces: [
    "Rest is not the opposite of progress today. One quiet pause may be what lets the next idea arrive cleanly.",
    "A feeling is data, not a decision. Note it, then choose with your head as well.",
    "Boundaries make compassion sustainable. One gentle no protects many yeses.",
    "Art made imperfectly beats art postponed forever. Make the imperfect version.",
    "Daydreaming with a notebook nearby turns drifting into drafting. Keep one close.",
    "Someone else's mood is not your weather. Notice it without moving into it.",
    "End the day by naming one good thing, however small. Small counts.",
  ],
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
}

export function dailyHoroscope(sign: SunSign, date: string): DailyHoroscope {
  const doy = dayOfYear(date);
  const signIndex = SUN_SIGNS.indexOf(sign);
  return {
    sign,
    date,
    theme: SIGN_THEMES[sign][(doy + signIndex) % SIGN_THEMES[sign].length],
    reflection: DAILY_LINES[doy % DAILY_LINES.length],
  };
}

const WEEKLY_LINES = [
  "This week, choose one theme and let it organise the rest. A week with a single focus is easier to look back on than a week with seven half finished plans.",
  "A conversation you have been putting off may be easier this week than last week. Try the shorter, kinder version first.",
  "Expect one plan to change midweek. That change is not a failure of planning, it is the week telling you what actually matters.",
  "Finish one small thing early in the week. That finished feeling is useful fuel for the harder work later in the week.",
  "Rest is part of a week, not a break from it. Protect one calm evening and see how the rest of the week feels after it.",
  "Other people may need more from you this week than usual. Decide in advance where your limit is, and hold it kindly.",
  "Look for a pattern across the week, not a verdict on any single day. One difficult day does not define a week.",
];

export interface WeeklyHoroscope {
  sign: SunSign;
  weekStart: string;
  theme: string;
  reflection: string;
}

export function weekStartMonday(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weeklyHoroscope(sign: SunSign, date: string): WeeklyHoroscope {
  const start = weekStartMonday(date);
  const h = hashString(`${sign}|week|${start}`);
  const weekNum = Math.floor(dayOfYear(start) / 7);
  const signIndex = SUN_SIGNS.indexOf(sign);
  return {
    sign,
    weekStart: start,
    theme: SIGN_THEMES[sign][(weekNum + signIndex) % SIGN_THEMES[sign].length],
    reflection: WEEKLY_LINES[(h + weekNum) % WEEKLY_LINES.length],
  };
}

export function isSunSign(v: string): v is SunSign {
  return (SUN_SIGNS as readonly string[]).includes(v);
}
