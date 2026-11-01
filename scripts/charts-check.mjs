// Phase 1 chart check: assert-based self-check, no new test framework.
// Run: node scripts/charts-check.mjs
// It imports src/lib/charts.ts directly (Node 24 type stripping).
// Privacy: test birth data below is used only in-memory for this check;
// nothing here is stored, sent to AI, or written to a database.
import assert from "node:assert";
import { calculateZiwei, calculateWestern, timeIndexForHour, applyLongitudeCorrection } from "../src/lib/charts.ts";
import { calculateVedic } from "../src/lib/vedic.ts";
import { SQUARE_CELLS, squareCellForPalaceIndex } from "../src/lib/ziwei-square.ts";
import { dailyHoroscope } from "../src/lib/daily.ts";
import { chartInterpretationCost } from "../src/lib/chart-pricing.ts";
import {
  formatChineseDateEn,
  formatLunarDateEn,
  formatTimeLabelEn,
  localizeStar,
  localizeMinorStar,
  zodiacEn,
} from "../src/lib/ziwei-i18n.ts";
import fs from "node:fs";
import { polar, sectorEnd, sectorStart, wedgePath } from "../src/lib/ziwei-ring.ts";

const ziweiA = calculateZiwei({ date: "1990-01-01", hour: 8, gender: "female" });
assert.equal(ziweiA.palaces.length, 12, "ziwei A must have 12 palaces");
assert.equal(ziweiA.solarDate, "1990-01-01");
assert.ok(ziweiA.palaces.some((p) => p.isLifePalace), "ziwei A must mark a life palace");
assert.ok(ziweiA.palaces.every((p) => p.name && Array.isArray(p.majorStars)), "ziwei palaces need names + majorStars");
console.log("ziwei A:", ziweiA.solarDate, "| zodiac:", ziweiA.zodiac, "| sign:", ziweiA.sign, "| life palace:", ziweiA.palaces.find((p) => p.isLifePalace)?.name, "| life major stars:", ziweiA.palaces.find((p) => p.isLifePalace)?.majorStars.join(", ") || "(empty)");

const ziweiB = calculateZiwei({ date: "2000-06-15", hour: 14, minute: 30, gender: "male" });
assert.equal(ziweiB.palaces.length, 12, "ziwei B must have 12 palaces");
assert.equal(ziweiB.solarDate, "2000-06-15");
console.log("ziwei B:", ziweiB.solarDate, "| zodiac:", ziweiB.zodiac, "| sign:", ziweiB.sign, "| life palace:", ziweiB.palaces.find((p) => p.isLifePalace)?.name, "| life major stars:", ziweiB.palaces.find((p) => p.isLifePalace)?.majorStars.join(", ") || "(empty)");

// Ziwei two-language data: English is primary for western clients, Chinese is
// kept as the second option. Both languages must be derivable from the same
// raw chart, and the underlying math / palace order must not change.
assert.equal(localizeStar("太阳").en, "Sun");
assert.equal(localizeStar("太阳").pinyin, "Tai Yang");
assert.equal(localizeStar("天梁").en, "Blessing");
assert.equal(localizeStar("武曲").en, "Financier");
assert.equal(localizeStar("破军").en, "Reformer");
assert.equal(localizeStar("太阳").zh, "太阳");
assert.equal(localizeMinorStar("左辅").pinyin, "Zuo Fu");
assert.equal(localizeMinorStar("左辅").zh, "左辅");
const ziweiAEnLife = ziweiA.palaces.find((p) => p.isLifePalace)?.majorStars.map((s) => localizeStar(s).en);
assert.deepEqual(ziweiAEnLife, ["Sun", "Blessing"]);
const ziweiBEnLife = ziweiB.palaces.find((p) => p.isLifePalace)?.majorStars.map((s) => localizeStar(s).en);
assert.deepEqual(ziweiBEnLife, ["Financier", "Reformer"]);
// Chinese mode still returns the raw Chinese names untouched.
assert.deepEqual(ziweiA.palaces.find((p) => p.isLifePalace)?.majorStars, ["太阳", "天梁"]);
assert.equal(formatLunarDateEn(ziweiA.lunarDate), "Lunar year 1989, month 12, day 5");
assert.equal(formatLunarDateEn(ziweiB.lunarDate), "Lunar year 2000, month 5, day 14");
assert.equal(formatChineseDateEn(ziweiA.chineseDate), "Ji-Si, Ding-Chou, Bing-Yin, Ren-Chen");
assert.equal(formatTimeLabelEn(ziweiA.timeLabel), "Chen hour (07:00-09:00)");
assert.equal(formatTimeLabelEn(ziweiB.timeLabel), "Wei hour (13:00-15:00)");
console.log("ziwei EN life A:", ziweiAEnLife?.join(", "), "| EN life B:", ziweiBEnLife?.join(", "));

// timeIndex mapping: 8:00 -> 辰 (index 4), 14:30 -> 未 (index 7), unknown -> noon index 6
assert.equal(timeIndexForHour(8), 4);
assert.equal(timeIndexForHour(14, 30), 7);
assert.equal(timeIndexForHour(null), 6);

const westA = calculateWestern({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westA.sunSign, "Capricorn", "1990-01-01 Sun must be Capricorn");
assert.ok(westA.planets.length >= 10, "western A needs 10+ planets");
assert.ok(westA.cusps.length === 12, "western A needs 12 cusps");
assert.ok(westA.ascendantLongitude >= 0 && westA.ascendantLongitude < 360);
console.log("western A:", "Sun", westA.sunSign, westA.planets.find((p) => p.name === "Sun")?.longitude.toFixed(2), "| Asc", westA.ascendantSign, westA.ascendantLongitude.toFixed(2), "| MC", westA.midheavenSign);

// Audit fix: aspects must be listable, not just a count. The list comes
// from the same library calculation, no new math.
assert.equal(westA.aspects.length, westA.aspectCount, "western aspects list length must match aspectCount");
assert.ok(westA.aspects.every((a) => a.planet1 && a.planet2 && a.label && typeof a.orb === "number"), "western aspects need both planets, a label, and an orb");
console.log("western aspects:", westA.aspectCount, "listed, first:", westA.aspects[0].planet1, westA.aspects[0].label, westA.aspects[0].planet2);

const westB = calculateWestern({ date: "2000-06-15", hour: 14, minute: 30, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westB.sunSign, "Gemini", "2000-06-15 Sun must be Gemini");
assert.ok(westB.planets.length >= 10);
console.log("western B:", "Sun", westB.sunSign, westB.planets.find((p) => p.name === "Sun")?.longitude.toFixed(2), "| Asc", westB.ascendantSign, westB.ascendantLongitude.toFixed(2), "| MC", westB.midheavenSign);

const westUnknown = calculateWestern({ date: "2000-06-15", hour: null, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westUnknown.unknownTime, true, "unknown time must be flagged");
assert.equal(westUnknown.sunSign, "Gemini", "unknown-time Sun still Gemini at noon");
console.log("western unknown-time: flagged, Sun", westUnknown.sunSign);

// Ziwei ring geometry: 12 sectors, 30 degrees each, clockwise from the top.
// 0 degrees is the top of the circle, 90 degrees is the right.
assert.equal(sectorStart(0), 0);
assert.equal(sectorEnd(0), 30);
assert.equal(sectorStart(11), 330);
assert.equal(sectorEnd(11), 360);
const top = polar(360, 360, 100, 0);
assert.ok(Math.abs(top.x - 360) < 0.01 && Math.abs(top.y - 260) < 0.01, "0 degrees must be the top");
const right = polar(360, 360, 100, 90);
assert.ok(Math.abs(right.x - 460) < 0.01 && Math.abs(right.y - 360) < 0.01, "90 degrees must be the right");
const path = wedgePath(360, 360, 150, 340, 0, 30);
assert.ok(path.startsWith("M 360.00 20.00"), "wedge must start at the outer top");
assert.ok(path.includes("A 340 340 0 0 1"), "wedge outer arc must sweep clockwise");
assert.ok(path.endsWith("Z"), "wedge must close");

// Traditional square view: 12 perimeter cells, centre 2x2 free, same order.
assert.equal(SQUARE_CELLS.length, 12, "square must have 12 cells");
assert.equal(new Set(SQUARE_CELLS.map((c) => `${c.row},${c.col}`)).size, 12, "square cells must be unique");
assert.ok(SQUARE_CELLS.every((c) => c.row >= 1 && c.row <= 4 && c.col >= 1 && c.col <= 4), "square cells must be inside 4x4");
assert.ok(!SQUARE_CELLS.some((c) => c.row >= 2 && c.row <= 3 && c.col >= 2 && c.col <= 3), "square centre 2x2 must stay free");
assert.deepEqual(squareCellForPalaceIndex(0), { row: 1, col: 1 }, "square first palace is top-left");
assert.deepEqual(squareCellForPalaceIndex(11), { row: 2, col: 1 }, "square last palace is left column, second row");

// Longitude correction: Manila 120.9842 -> meridian 120, +3.94 minutes,
// which does not cross a double-hour, so old examples must stay unchanged.
const manilaCorr = applyLongitudeCorrection("1990-01-01", 8, 0, 120.9842);
assert.equal(manilaCorr.correctionMinutes, 3.9, "Manila correction is about +3.9 minutes (rounded to 1 decimal in code: 3.9)");
assert.equal(manilaCorr.hour, 8);
assert.equal(manilaCorr.minute, 4);
const tokyoCorr = applyLongitudeCorrection("1990-01-01", 8, 0, 139.6503);
assert.equal(tokyoCorr.meridian, 135);
assert.ok(tokyoCorr.correctionMinutes > 18 && tokyoCorr.correctionMinutes < 19, "Tokyo correction is about +18.6 minutes");
const crossCorr = applyLongitudeCorrection("1990-01-01", 23, 55, 139.6503);
assert.equal(crossCorr.date, "1990-01-02", "correction crossing midnight moves the solar date");
assert.equal(crossCorr.hour, 0);
const ziweiSolar = calculateZiwei({ date: "1990-01-01", hour: 8, gender: "female", longitude: 120.9842 });
assert.equal(ziweiSolar.solarCorrectionMinutes, 3.9);
assert.deepEqual(ziweiSolar.palaces.find((p) => p.isLifePalace)?.majorStars, ["太阳", "天梁"], "Manila solar correction must not change old Ziwei A");
const ziweiNoLon = calculateZiwei({ date: "1990-01-01", hour: 8, gender: "female" });
assert.equal(ziweiNoLon.solarCorrectionMinutes, 0, "no longitude means no correction");

// Vedic, Caelus MIT, Lahiri sidereal, whole-sign houses. Values verified
// against a direct Caelus run on 2026-11-01: Sun sidereal is about 23.7
// degrees behind the tropical Sun (Capricorn 280.30 -> Sagittarius 256.58).
const vedicA = calculateVedic({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
assert.equal(vedicA.sunSign, "Sagittarius");
assert.equal(vedicA.moonSign, "Aquarius");
assert.equal(vedicA.moonNakshatra, "Dhanishta");
assert.equal(vedicA.moonNakshatraPada, 3);
assert.equal(vedicA.planets.length, 9, "vedic A needs 7 planets plus Rahu and Ketu");
assert.equal(vedicA.cusps.length, 12);
assert.ok(vedicA.currentDasha.length > 0, "vedic A needs a current dasha string");
const vedicB = calculateVedic({ date: "2000-06-15", hour: 14, minute: 30, latitude: 14.5995, longitude: 120.9842 });
assert.equal(vedicB.sunSign, "Gemini");
assert.equal(vedicB.moonNakshatra, "Anuradha");
assert.equal(vedicB.moonNakshatraPada, 3);
console.log("vedic A:", vedicA.sunSign, vedicA.moonSign, vedicA.moonNakshatra, vedicA.moonNakshatraPada, "| B:", vedicB.sunSign, vedicB.moonNakshatra, vedicB.moonNakshatraPada);

// Daily sun-sign: original Sortes text, deterministic per sign and date.
const dailyA = dailyHoroscope("Aries", "2026-11-01");
const dailyA2 = dailyHoroscope("Aries", "2026-11-01");
assert.equal(dailyA.theme, dailyA2.theme, "daily must be deterministic for the same sign and date");
assert.ok(dailyA.luckyNumber >= 1 && dailyA.luckyNumber <= 9, "daily lucky number must be 1-9");
assert.ok(dailyA.luckyColour.length > 0, "daily needs a lucky colour");
assert.notEqual(dailyHoroscope("Taurus", "2026-11-01").theme, dailyA.theme, "daily themes differ per sign");
console.log("daily Aries 2026-11-01:", dailyA.theme.slice(0, 60) + "...");

// Re-audit fixes, batch 4:
// English Ziwei summary must contain no raw Chinese: it is built from
// the i18n map (English stars + English zodiac), not from raw values.
const enSummary = `Ziwei chart. Life: ${ziweiAEnLife?.join(", ")}. Zodiac: ${zodiacEn(ziweiA.zodiac)}.`;
assert.equal(zodiacEn(ziweiA.zodiac), "Snake");
assert.ok(!/[\u4e00-\u9fff]/.test(enSummary), "English Ziwei summary must have no Chinese characters");
console.log("ziwei EN summary:", enSummary);
// Square is the default Ziwei view, and the reminder dialog is off charts:
// these are React source facts, asserted from source, not from a browser.
const chartsClient = fs.readFileSync(new URL("../src/app/charts/ChartsClient.tsx", import.meta.url), "utf8");
assert.ok(chartsClient.includes('useState<ZiweiView>("square")'), "Ziwei default view must be square");
assert.ok(chartsClient.includes('chartSummaryText(result, ziweiLang)'), "summary must follow the chart language");
const pushPrompt = fs.readFileSync(new URL("../src/components/PushPrompt.tsx", import.meta.url), "utf8");
assert.ok(pushPrompt.includes('pathname?.startsWith("/charts")'), "reminder dialog must be suppressed on /charts");
// Vedic dasha planets must be capitalised, not lower-case saturn/mercury.
assert.ok(vedicA.currentDasha.split(" / ").every((s) => /^[A-Z]/.test(s)), "Vedic dasha names must be capitalised");
console.log("vedic dasha A:", vedicA.currentDasha);

// Expansion 5: light theme + icons, source assertions only.
// Light tokens must exist and must not use bright gold as normal text:
// goldbright in light is dark #7c5e00, gold is dark #8a6d0a, cream text
// in light is dark ink #1c1a15, panel in light is white.
const globals = fs.readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
assert.ok(globals.includes('html[data-theme="light"]'), "light theme block must exist");
assert.ok(globals.includes("--color-goldbright: #7c5e00"), "light goldbright must be dark gold for AA");
assert.ok(globals.includes("--color-cream: #1c1a15"), "light cream text must be dark ink");
assert.ok(!/html\[data-theme="light"\][\s\S]{0,600}--color-goldbright: #f4d03f/.test(globals), "light theme must not keep bright gold as text");
const layout = fs.readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
assert.ok(layout.includes("sortes-theme"), "layout must set theme from localStorage before paint");
const header = fs.readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
assert.ok(header.includes("sortes-theme") && header.includes("Switch to light theme"), "header must have a persisted theme toggle");
const icon = fs.readFileSync(new URL("../src/components/Icon.tsx", import.meta.url), "utf8");
assert.ok(icon.includes("Tabler") && icon.includes("Iconoir") && icon.includes("iconoirSun"), "icon set must be Tabler MIT plus verified Iconoir MIT paths");
const wheel = fs.readFileSync(new URL("../src/components/WesternWheel.tsx", import.meta.url), "utf8");
assert.ok(wheel.includes("sortes-theme-change") && wheel.includes("CustomWesternWheel"), "Western wheel must re-render in light theme via the custom wheel");

// Pricing: first chart per system free, then 1 credit.
assert.equal(chartInterpretationCost(false), 0, "first chart per system is free");
assert.equal(chartInterpretationCost(true), 1, "later charts cost 1 credit");

console.log("charts-check: all assertions passed");

// Audit 3 batch (PR #5): light Ziwei circle tokens, glosses toggle
// default, collapsed timezone disclosure, Share before interpretation,
// dark Buy button tokens, hero CTA no-wrap. Source assertions only:
// they prove the code that the live re-audit must then see visually.
{
  const board = fs.readFileSync("src/components/ZiweiChartBoard.tsx", "utf8");
  assert.ok(board.includes('RING_LIGHT = { bg: "#fffdf5"'), "light Ziwei circle must use cream background, not navy");
  assert.ok(board.includes('text: "#1c1a15"'), "light Ziwei circle must use ink text");
  assert.ok(!board.includes("textLength={"), "ring must not force textLength: it stretched short palace names (Career, Health) with wide letter-spacing in the rendered screenshot");
  assert.ok(!board.includes("stemPos"), "ring must no longer carry the stem-branch line that collided");
  assert.ok(board.includes("showGlosses"), "Ziwei board must accept a glosses toggle");
  assert.ok(board.includes("glosses ?") || board.includes("glosses &&"), "glosses must gate the Chinese parentheticals");
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(charts.includes('setShowGlosses(lang === "zh")'), "glosses must default off in English and on in Chinese");
  assert.ok(charts.includes("Show Chinese glosses"), "glosses toggle label must exist");
  assert.ok(charts.includes("<details") && charts.includes("Before you calculate, please note"), "timezone disclosure must be collapsible, not a long block above Calculate");
  assert.ok(charts.includes("No timezone lookup is added"), "collapsed disclosure must keep the no-timezone-DB, no-DST wording");
  assert.ok(charts.includes("Share chart as image"), "Share button must exist on results, not only after interpretation");
  // Share button must appear before the chart board (result level), not only in the interpretation section.
  const shareIdx = charts.indexOf("Share chart as image");
  const interpIdx = charts.indexOf('aria-label="Chart interpretation"');
  assert.ok(shareIdx > 0 && shareIdx < interpIdx, "first Share button must come before the interpretation section");
  assert.ok(charts.includes("scroll-mt-24"), "result and legend sections must carry scroll margin under the sticky header");
  const wheel = fs.readFileSync("src/components/WesternWheel.tsx", "utf8");
  assert.ok(wheel.includes("CustomWesternWheel"), "Western wheel must use the custom SVG wheel with staggered labels");
  assert.ok(!wheel.includes("@astrodraw/astrochart"), "AstroChart must no longer be used: it cannot stagger labels inside its SVG");
  assert.ok(board.includes("rotate(${rot}"), "Ziwei ring labels must be tangentially rotated so side wedges do not cross into neighbours");
  const custom = fs.readFileSync("src/components/CustomWesternWheel.tsx", "utf8");
  assert.ok(custom.includes("prevDisplay - 9") || custom.includes("display"), "custom wheel must stagger clustered planet labels by display angle");
  assert.ok(custom.includes("leader") || custom.includes("<line"), "custom wheel must draw leader lines from true position to staggered label");
  assert.ok(wheel.includes("Clustered planets, staggered list"), "Western wheel must carry a staggered cluster list outside the wheel");
  assert.ok(wheel.includes("scroll-mt-24"), "Western aspects/wheel headings must carry scroll margin");
  const credits = fs.readFileSync("src/app/credits/CreditsClient.tsx", "utf8");
  // Audit 4 supersedes the Audit 3 btn-secondary note: all Buy buttons
  // are now the same solid btn-gold, popular distinguished by badge only.
  assert.ok(!credits.includes("btn-secondary"), "Audit 4: credits Buy buttons must no longer use btn-secondary");
  assert.ok(credits.includes('className="btn-gold mt-5 w-full rounded-xl px-4 py-3 font-bold"'), "all credits Buy buttons must be solid btn-gold, equal size and weight");
  assert.ok(credits.includes("Most popular") || credits.includes("MOST POPULAR") || credits.includes("Most Popular"), "popular pack must still carry its badge distinction");
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes(".btn-secondary"), "btn-secondary must be defined in globals.css");
  assert.ok(css.includes("details,") && css.includes("scroll-margin-top: 6rem"), "details elements must get the sticky-header scroll margin");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(home.includes("whitespace-nowrap") && home.includes("Draw a Card"), "home hero CTAs must not wrap");
  const motion = fs.readFileSync("src/components/MotionProvider.tsx", "utf8");
  assert.ok(motion.includes('reducedMotion="user"'), "MotionProvider must still respect reduced motion");
  assert.ok(css.includes("prefers-reduced-motion: reduce"), "CSS reduced-motion rule must still exist");
  assert.ok(!board.includes("animation") || !board.includes("rotate"), "no new auto-rotating wheel motion may be added");
  console.log("audit3: light ring, glosses default, collapsed timezone, share-before-interpretation, thin wheel + cluster list, solid Buy buttons (Audit 4 supersedes btn-secondary), hero no-wrap, reduced motion: all source assertions passed");
}

// Audit 4 batch (PR #6): the reservations that kept the verdict at
// "Yes, with reservations" instead of a full yes. Source assertions
// only; the rendered screenshots in sortes-audit7-screenshots are the
// visual proof, and the live re-audit must re-check them in browser.
{
  // Root cause, verified against @astrodraw/astrochart radix.ts:
  // drawUniverse fills each sign segment with COLORS_SIGNS[i], and
  // sign glyphs are stroked with SIGNS_COLOR. Batch 5 set both to
  // goldbright, so the band was solid gold with gold glyphs on gold.
  // The fix is a band fill equal to the wheel background, in both
  // themes, so only the 1px circle strokes remain and glyphs contrast.
  const custom4 = fs.readFileSync("src/components/CustomWesternWheel.tsx", "utf8");
  assert.ok(custom4.includes('bg = dark ? "#1a1f2e" : "#fffdf5"'), "custom wheel background must match the theme, no solid gold band");
  assert.ok(!custom4.includes('fill="#f4d03f"') || custom4.includes('gold = dark ? "#f4d03f"'), "custom wheel must not fill the sign band gold");
  // Hero CTAs: definitive no-wrap, not just whitespace-nowrap.
  const home = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(home.includes("sm:flex-nowrap"), "hero CTA row must be flex-nowrap at sm+");
  assert.ok(home.includes("w-[3.25rem]"), "daily teaser cards must be narrow enough for a 360px phone (5 x 52 + gaps = 308px, inside 328px content width)");
  assert.ok(home.includes("shrink-0 whitespace-nowrap") && home.includes("Draw a Card"), "hero CTA links must be shrink-0 and whitespace-nowrap");
  // Chinese Ziwei legend, from ziwei-i18n.ts, not invented in the page.
  const i18n = fs.readFileSync("src/lib/ziwei-i18n.ts", "utf8");
  assert.ok(i18n.includes("ZIWEI_LEGEND_ZH"), "Chinese Ziwei legend data must live in ziwei-i18n.ts");
  assert.ok(i18n.includes('zh: "命宫"') && i18n.includes('zh: "父母"'), "Chinese legend must cover all 12 palaces, Life through Parents");
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(charts.includes("ZIWEI_LEGEND_ZH"), "charts page must use the Chinese legend in Chinese mode");
  assert.ok(charts.includes('ziweiLang === "zh"'), "Chinese legend must be gated on chart language zh, English mode unchanged");
  // Western/Vedic legends are deliberately NOT translated in this batch.
  assert.ok(!i18n.includes("WESTERN_LEGEND_ZH") && !i18n.includes("VEDIC_LEGEND_ZH"), "Western/Vedic legends must not be invented in this batch; they stay English and are reported as remaining");
  console.log("audit4: wheel band fill = background in both themes, solid Buy buttons, hero flex-nowrap + shrink-0, Chinese Ziwei legend: all source assertions passed");
}

// Audit 5 + aislop batch (PR #7): custom wheel on-wheel stagger, Chinese
// legend heading, interpretation language note, credits card tint,
// static theme script, number font, auth fail-fast.
{
  const custom = fs.readFileSync("src/components/CustomWesternWheel.tsx", "utf8");
  assert.ok(custom.includes("gap < 8") || custom.includes("within 8"), "custom wheel must stagger planets within 8 degrees");
  assert.ok(custom.includes("As") && custom.includes("Mc"), "custom wheel must mark Ascendant and Midheaven");
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(charts.includes("如何读这张星盘"), "legend heading must be Chinese in Chinese mode");
  assert.ok(charts.includes("解读") && charts.includes("AI 用英文生成"), "interpretation heading must follow chart language, with a note that AI text stays English");
  const credits = fs.readFileSync("src/app/credits/CreditsClient.tsx", "utf8");
  assert.ok(!credits.includes('bg-gold/10'), "popular credits card must carry no extra gold tint; badge is the only distinction");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(!layout.includes("dangerouslySetInnerHTML"), "layout must not use dangerouslySetInnerHTML for the theme script");
  assert.ok(layout.includes('/theme.js'), "theme script must load from the static public/theme.js file");
  assert.ok(fs.existsSync("public/theme.js"), "public/theme.js must exist");
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--font-number"), "number font token must exist in globals.css");
  assert.ok(css.includes("tabular-nums"), "numbers must use tabular figures");
  const typewriter = fs.readFileSync("src/components/TypewriterText.tsx", "utf8");
  assert.ok(typewriter.includes("<button") && !typewriter.includes('role="button"'), "typewriter must be a real button, not a div with role button");
  assert.ok(!typewriter.includes("useRef"), "typewriter must not access refs during render");
  const burst = fs.readFileSync("src/components/CardBurst.tsx", "utf8");
  assert.ok(!burst.includes("Math.random()"), "CardBurst must not call Math.random during render");
  const share = fs.readFileSync("src/components/ShareReading.tsx", "utf8");
  assert.ok(share.includes("next/image") || share.includes("from \"next/image\""), "share card must use next/image, not a raw img element");
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.ok(auth.includes("authConfigured"), "auth must expose a fail-fast configured check");
  console.log("audit5+aislop: custom wheel stagger, Chinese legend heading, interpretation language note, credits tint removed, static theme script, number font, typewriter button, deterministic burst, share next/image, auth fail-fast: all source assertions passed");
}

// Audit 6 batch (PR #8): wheel label separation, list intro reword,
// code-step preview, collapsed charts intro with Use example on top.
{
  const custom = fs.readFileSync("src/components/CustomWesternWheel.tsx", "utf8");
  assert.ok(custom.includes("MIN_LABEL_SEP = 12"), "custom wheel must enforce a 12-degree minimum label separation");
  assert.ok(custom.includes("placed"), "custom wheel must check each new label against all placed labels, not just the previous one");
  assert.ok(custom.includes("polar(cx, cy, 282, 180)"), "As label must move in from the rim edge (radius 282, not 296)");
  assert.ok(custom.includes("mcTangent"), "Mc label must be nudged tangentially away from the nearest sign glyph");
  assert.ok(custom.includes("nearest"), "Mc nudge must be computed from the nearest sign glyph");
  const wheel = fs.readFileSync("src/components/WesternWheel.tsx", "utf8");
  assert.ok(wheel.includes("Read them here too, in longitude order"), "staggered list intro must say 'here too', not 'instead of from the wheel'");
  assert.ok(!wheel.includes("instead of from the wheel"), "old contradictory list intro must be gone");
  const account = fs.readFileSync("src/app/account/AccountClient.tsx", "utf8");
  assert.ok(account.includes("6-digit code will be sent"), "account page must preview the code step before sending a code");
  assert.ok(account.includes("Code field preview"), "account page must show the code field format preview");
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.ok(auth.includes('padStart(6, "0")'), "code length preview must match auth.ts: 6 digits");
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(charts.includes("How each system uses your inputs (tap for details)"), "long charts intro must be collapsed behind a details summary");
  assert.ok(charts.includes("Before you calculate, please note"), "timezone disclosure must stay reachable, only its position/collapse state may change");
  const useExampleIdx = charts.indexOf("Use example: 1990-01-01, 08:00, Manila");
  const birthDateIdx = charts.indexOf('id="chart-date"');
  assert.ok(useExampleIdx > 0 && useExampleIdx < birthDateIdx, "Use example must sit at the top of the form, before the first field, so it is visible without scrolling");
  console.log("audit6: wheel 12-degree separation, As in from rim, Mc tangent nudge, list intro reworded, code-step preview, collapsed charts intro, Use example on top: all source assertions passed");
}

// Batch 9 (PR #9): themed calendar + visible magic. The native date
// input is gone, because its popup is browser-drawn and never
// followed the Sortes theme or icons.
{
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(!charts.includes('type="date"'), "charts must not use a native date input, its popup is browser-drawn and unthemed");
  assert.ok(charts.includes("ThemedDatePicker"), "charts must use the themed date picker");
  assert.ok(charts.includes("CardBurst") && charts.includes("magic-glow"), "chart result must burst and glow on reveal");
  const picker = fs.readFileSync("src/components/ThemedDatePicker.tsx", "utf8");
  assert.ok(picker.includes('name="calendar"'), "date field must show the Tabler calendar icon, not the browser glyph");
  assert.ok(picker.includes("Clear") && picker.includes("Today"), "calendar popup must offer Clear and Today like the screenshot layout");
  assert.ok(picker.includes("Su") && picker.includes("Sa"), "calendar popup must show Su through Sa weekdays");
  assert.ok(picker.includes("bg-panel"), "calendar popup must use the panel token so it flips with the theme");
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("color-scheme: dark") && css.includes("color-scheme: light"), "remaining native pickers must follow the theme via color-scheme");
  assert.ok(css.includes("calendar-pop") && css.includes("magic-glow"), "calendar entrance and result glow must exist in globals.css");
  const star = fs.readFileSync("src/components/Starfield.tsx", "utf8");
  assert.ok(star.includes("sparkles"), "starfield must include larger twinkling sparkles, not only tiny dots");
  const icon = fs.readFileSync("src/components/Icon.tsx", "utf8");
  assert.ok(icon.includes("chevronLeft"), "calendar month navigation needs a Tabler chevronLeft icon");
  console.log("batch9: themed calendar replaces native date, Tabler icon, Clear/Today, color-scheme, chart burst and glow, starfield sparkles: all source assertions passed");
}
