// Phase 1 chart check: assert-based self-check, no new test framework.
// Run: node scripts/charts-check.mjs
// It imports src/lib/charts.ts directly (Node 24 type stripping).
// Privacy: test birth data below is used only in-memory for this check;
// nothing here is stored, sent to AI, or written to a database.
import assert from "node:assert";
import { calculateZiwei, calculateZiweiStacks, calculateWestern, computeTransits, timeIndexForHour, applyLongitudeCorrection } from "../src/lib/charts.ts";
import { calculateVedic, navamsaSign, dasamsaSign, computePanchanga, computeGochara } from "../src/lib/vedic.ts";
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

// M3.3: palace activation stacks on the golden Ziwei case
// (1990-01-01, hour 8, female, Manila). For 2026 the decade must be
// the 34-43 / 2022-2031 decade on Home (田宅, index 10, stem 丙),
// and the annual palace must be the palace with branch 午, Children
// (子女, index 4), also stem 丙. Both layers therefore share the 丙
// Si Hua set in Lu, Quan, Ke, Ji order: 天同, 天机, 文昌, 廉贞.
const stacksA = calculateZiweiStacks({ date: "1990-01-01", hour: 8, gender: "female", longitude: 120.9842 }, 2026, "2026-11-03");
assert.equal(stacksA.year, 2026, "stacks must echo the year");
assert.equal(stacksA.decade.palaceNameZh, "田宅", "2026 decade palace must be Home");
assert.equal(stacksA.decade.index, 10, "2026 decade index must be 10");
assert.deepEqual(stacksA.decade.ageRange, [34, 43], "2026 decade ages must be 34-43");
assert.deepEqual(stacksA.decade.yearRange, [2022, 2031], "2026 decade years must be 2022-2031");
assert.equal(stacksA.decade.heavenlyStem, "丙", "2026 decade stem must be 丙");
assert.deepEqual(stacksA.decade.mutagen, ["天同", "天机", "文昌", "廉贞"], "丙 stem Si Hua must be 天同, 天机, 文昌, 廉贞");
assert.equal(stacksA.annual.palaceNameZh, "子女", "2026 annual palace must be Children");
assert.equal(stacksA.annual.index, 4, "2026 annual index must be 4");
assert.equal(stacksA.annual.heavenlyStem, "丙", "2026 annual stem must be 丙");
assert.deepEqual(stacksA.annual.mutagen, ["天同", "天机", "文昌", "廉贞"], "2026 annual Si Hua must match the decade stem set");
assert.equal(stacksA.stacks.length, 12, "stacks need all 12 palaces");
assert.equal(stacksA.stacks.filter((s) => s.decadeActive).length, 1, "exactly one palace is the decade palace");
assert.equal(stacksA.stacks.find((s) => s.decadeActive).index, 10, "the decade palace row must be index 10");
assert.equal(stacksA.stacks.filter((s) => s.annualActive).length, 1, "exactly one palace is the annual palace");
assert.equal(stacksA.stacks.find((s) => s.annualActive).index, 4, "the annual palace row must be index 4");
assert.ok(stacksA.stacks.every((s) => s.decadeStars.every((n) => n.startsWith("运"))), "decade stars must all be decade (运) stars");
assert.ok(stacksA.stacks.every((s) => s.annualStars.every((n) => n.startsWith("流") || n === "年解")), "annual stars must all be annual (流) stars or the annual Jie star");
assert.ok(stacksA.daily.palaceNameZh && stacksA.daily.mutagen.length === 4, "daily rhythm needs a palace and a 4-star Si Hua set");
assert.equal(stacksA.dailyDate, "2026-11-3", "daily date must echo the requested day, unpadded as iztro takes it");
assert.throws(() => calculateZiweiStacks({ date: "1990-01-01", hour: 8, gender: "female", longitude: 120.9842 }, 1800), /No decade covers/, "a year outside the decade range must be refused");
assert.throws(() => calculateZiweiStacks({ date: "1990-01-01", hour: null, gender: "female", longitude: 120.9842 }, 2026), /birth hour/, "stacks without a birth hour must be refused like the natal chart");
console.log("stacks 2026: decade", stacksA.decade.palaceNameZh, stacksA.decade.ageRange.join("-"), "| annual", stacksA.annual.palaceNameZh, "| daily rhythm", stacksA.daily.palaceNameZh);

// timeIndex mapping: 8:00 -> 辰 (index 4), 14:30 -> 未 (index 7), unknown -> noon index 6
assert.equal(timeIndexForHour(8), 4);
assert.equal(timeIndexForHour(14, 30), 7);
assert.equal(timeIndexForHour(null), 6);

const westA = calculateWestern({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westA.sunSign, "Capricorn", "1990-01-01 Sun must be Capricorn");
assert.ok(westA.planets.length >= 10, "western A needs 10+ planets");
assert.ok(westA.cusps.length === 12, "western A needs 12 cusps");
assert.ok(westA.ascendantLongitude >= 0 && westA.ascendantLongitude < 360);
// Phase E (item 4): exact longitudes for the golden case, not just
// the sign. Values come from the library itself on this input; they
// are pinned so a library or conversion regression shows up here.
const closeTo = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: got ${actual}, want ${expected} ± ${tol}`);
closeTo(westA.planets.find((p) => p.name === "Sun")?.longitude, 280.30, 0.01, "golden Sun longitude");
closeTo(westA.planets.find((p) => p.name === "Moon")?.longitude, 326.55, 0.01, "golden Moon longitude");
closeTo(westA.ascendantLongitude, 303.82, 0.01, "golden Ascendant longitude");
closeTo(westA.midheavenLongitude, 223.83, 0.01, "golden Midheaven longitude");
assert.equal(westA.polar, false, "Manila is not polar");
console.log("western A:", "Sun", westA.sunSign, westA.planets.find((p) => p.name === "Sun")?.longitude.toFixed(2), "| Asc", westA.ascendantSign, westA.ascendantLongitude.toFixed(2), "| MC", westA.midheavenSign);

// Audit fix: aspects must be listable, not just a count. The list comes
// from the same library calculation, no new math.
assert.equal(westA.aspects.length, westA.aspectCount, "western aspects list length must match aspectCount");
assert.ok(westA.aspects.every((a) => a.planet1 && a.planet2 && a.label && typeof a.orb === "number"), "western aspects need both planets, a label, and an orb");
// Phase E (item 4): every aspect carries its applying/separating
// state from the 24-hour-later comparison, and the golden Sun-Saturn
// conjunction is applying (the Sun closes on slow Saturn).
assert.ok(westA.aspects.every((a) => ["applying", "separating", "steady"].includes(a.state)), "western aspects need an applying/separating state");
assert.equal(westA.aspects.find((a) => a.planet1 === "Sun" && a.planet2 === "Saturn")?.state, "applying", "golden Sun-Saturn conjunction must be applying");
console.log("western aspects:", westA.aspectCount, "listed, first:", westA.aspects[0].planet1, westA.aspects[0].label, westA.aspects[0].planet2);

const westB = calculateWestern({ date: "2000-06-15", hour: 14, minute: 30, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westB.sunSign, "Gemini", "2000-06-15 Sun must be Gemini");
assert.ok(westB.planets.length >= 10);
console.log("western B:", "Sun", westB.sunSign, westB.planets.find((p) => p.name === "Sun")?.longitude.toFixed(2), "| Asc", westB.ascendantSign, westB.ascendantLongitude.toFixed(2), "| MC", westB.midheavenSign);

const westUnknown = calculateWestern({ date: "2000-06-15", hour: null, latitude: 14.5995, longitude: 120.9842 });
assert.equal(westUnknown.unknownTime, true, "unknown time must be flagged");
assert.equal(westUnknown.sunSign, "Gemini", "unknown-time Sun still Gemini at noon");
// M1.2: no noon-derived angles or houses for unknown time.
assert.equal(westUnknown.ascendantSign, null, "unknown-time Rising must be withheld, not noon-derived");
assert.equal(westUnknown.ascendantLongitude, null, "unknown-time Rising longitude must be withheld");
assert.equal(westUnknown.midheavenSign, null, "unknown-time Midheaven must be withheld");
assert.equal(westUnknown.midheavenLongitude, null, "unknown-time Midheaven longitude must be withheld");
assert.equal(westUnknown.cusps.length, 0, "unknown-time cusps must be empty");
assert.ok(westUnknown.planets.every((p) => p.house === null), "unknown-time planet houses must all be null");
assert.ok(westUnknown.planets.every((p) => typeof p.retrograde === "boolean"), "western planets need a retrograde flag");
assert.equal(westUnknown.planets.find((p) => p.name === "Sun")?.retrograde, false, "Sun is never retrograde");
assert.equal(westUnknown.planets.find((p) => p.name === "Moon")?.retrograde, false, "Moon is never retrograde");
console.log("western unknown-time: flagged, Sun", westUnknown.sunSign, ", angles withheld, cusps empty");

// M1.2: Ziwei refuses an unknown hour instead of laying palaces from
// the noon double-hour.
assert.throws(
  () => calculateZiwei({ date: "2000-06-15", hour: null, gender: "female" }),
  /birth hour/,
  "ziwei unknown time must throw asking for a birth hour"
);

// M3.1: transit-to-natal honesty tests. The natal chart is the golden
// Western case (1990-01-01, Manila); transits are computed for
// 2026-11-03, a date safely inside Scorpio season for the Sun.
const natalA = westA.planets.map((p) => ({ name: p.name, longitude: p.longitude }));
const trA = computeTransits(natalA, "2026-11-03");
const trSun = trA.transitPlanets.find((p) => p.name === "Sun");
assert.equal(trSun.sign, "Scorpio", "transit Sun on 2026-11-03 must be Scorpio");
assert.ok(trSun.longitude >= 211 && trSun.longitude <= 241, "transit Sun longitude must sit inside Scorpio");
assert.ok(trA.aspects.length > 0, "a real date must yield at least one transit aspect in orb");
const ORB_MAX = { conjunction: 6, sextile: 4, square: 5, trine: 5, opposition: 6 };
assert.ok(trA.aspects.every((a) => a.orb <= ORB_MAX[a.aspect]), "every transit aspect must respect its published orb");
assert.ok(trA.aspects.every((a) => ["applying", "separating", "steady"].includes(a.state)), "every transit aspect needs a motion state");
const seenPairs = new Set(trA.aspects.map((a) => `${a.transitPlanet}|${a.natalPlanet}|${a.aspect}`));
assert.equal(seenPairs.size, trA.aspects.length, "no transit pair may list the same aspect twice");
assert.ok(trA.aspects.every((a) => a.orb >= 0), "transit orbs must be non-negative");
// The Moon crosses a sign in about 2.3 days, so any 4-day window must
// show at least two distinct Moon signs. This is the horoscope
// honesty test: transit output must change with the date.
const moonSigns = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map(
  (d) => computeTransits(natalA, d).moonSign
);
assert.ok(new Set(moonSigns).size >= 2, "transit Moon sign must change within a 4-day window");
assert.throws(() => computeTransits(natalA, "2026-13-40"), /real calendar date/, "transit with an invalid date must throw");
assert.throws(() => computeTransits([], "2026-11-03"), /non-empty/, "transit with no natal planets must throw");
console.log("transits 2026-11-03:", "Moon", trA.moonSign, "| aspects:", trA.aspects.length, "| tightest:", trA.aspects[0].transitPlanet, trA.aspects[0].aspect, trA.aspects[0].natalPlanet, `orb ${trA.aspects[0].orb}`, trA.aspects[0].state, "| Moon signs 11-03..06:", moonSigns.join(", "));

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

// M1.2: unknown-time Vedic withholds Lagna and houses; dasha dates
// come from the Moon longitude, and the golden case must reproduce
// the known timeline (Mars ends early 1992, Saturn current in 2026).
const vedicUnknown = calculateVedic({ date: "2000-06-15", hour: null, latitude: 14.5995, longitude: 120.9842 });
assert.equal(vedicUnknown.unknownTime, true, "vedic unknown time must be flagged");
assert.equal(vedicUnknown.ascendantSign, null, "unknown-time Vedic Rising must be withheld");
assert.equal(vedicUnknown.cusps.length, 0, "unknown-time Vedic cusps must be empty");
assert.ok(vedicUnknown.planets.every((p) => p.house === null), "unknown-time Vedic planet houses must all be null");
assert.ok(vedicUnknown.planets.every((p) => typeof p.retrograde === "boolean"), "vedic planets need a retrograde flag");
assert.equal(vedicUnknown.planets.find((p) => p.name === "rahu")?.retrograde, true, "Rahu is always retrograde by convention");
assert.equal(vedicUnknown.planets.find((p) => p.name === "ketu")?.retrograde, true, "Ketu mirrors Rahu");
const goldenTimeline = vedicA.dashaTimeline;
assert.ok(goldenTimeline.length >= 9, "dasha timeline needs at least the 9 lords");
assert.equal(goldenTimeline[0].lord, "Mars", "golden case starts in Mars mahadasha");
assert.equal(goldenTimeline[0].end.slice(0, 4), "1992", "golden Mars mahadasha must end in 1992");
assert.equal(goldenTimeline[0].end.slice(5, 7), "01", "golden Mars mahadasha must end in January 1992");
assert.equal(goldenTimeline[1].lord, "Rahu", "Rahu follows Mars");
assert.equal(goldenTimeline[2].lord, "Jupiter", "Jupiter follows Rahu");
assert.equal(goldenTimeline[3].lord, "Saturn", "Saturn follows Jupiter");
assert.ok(vedicA.currentAntardasha && vedicA.currentAntardasha.lord, "vedic A needs a current antardasha");
// Phase E (item 5): golden yogas, computed by caelus's classical
// rules from the D1 sign map. Mercury (9th lord) conjunct Venus
// (10th lord) is both a raja and a dhana yoga; Venus rules a pure
// kendra and a pure trikona, so it is the yogakaraka.
assert.ok(vedicA.yogas.some((y) => y.kind === "raja" && y.planets.join(",") === "Mercury,Venus" && y.via === "conjunction"), "golden raja yoga must be Mercury-Venus by conjunction");
assert.ok(vedicA.yogas.some((y) => y.kind === "dhana" && y.planets.join(",") === "Mercury,Venus" && y.via === "conjunction"), "golden dhana yoga must be Mercury-Venus by conjunction");
assert.ok(vedicA.yogas.some((y) => y.kind === "yogakaraka" && y.planets.join(",") === "Venus"), "golden yogakaraka must be Venus");
assert.equal(vedicA.yogas.filter((y) => y.kind === "placement").length, 0, "golden chart has no placement yogas");
// Phase E (item 5): Ashtakavarga on the golden chart. The 337
// checksum is the fixed grand total; every per-planet BAV row sums
// to its fixed total, so a table error shows up here.
assert.ok(vedicA.ashtakavarga && vedicA.ashtakavarga.total === 337, "golden Ashtakavarga must total 337");
assert.deepEqual(vedicA.ashtakavarga.sav, [23, 23, 29, 31, 27, 31, 23, 23, 31, 35, 34, 27], "golden SAV row");
// Phase E (item 4): the ayanamsa is a birth-date value, so it is
// pinned exactly; the pratyantar is dated by the same calculation
// as the antardasha, so it is asserted structurally (it must exist,
// sit inside the antardasha, cover today, and agree with the name
// caelus reports in the dasha string) rather than by fixed dates,
// which move as the as-of date moves.
closeTo(vedicA.ayanamsaDegrees, 23.7174, 0.0001, "golden Lahiri ayanamsa");
assert.ok(vedicA.currentPratyantar && vedicA.currentPratyantar.lord, "vedic A needs a dated current pratyantar");
assert.ok(vedicA.currentPratyantar.start >= vedicA.currentAntardasha.start && vedicA.currentPratyantar.end <= vedicA.currentAntardasha.end, "pratyantar must sit inside the current antardasha");
assert.ok(vedicA.dashaAsOf >= vedicA.currentPratyantar.start && vedicA.dashaAsOf < vedicA.currentPratyantar.end, "pratyantar must cover the as-of date");
assert.equal(vedicA.currentPratyantar.lord, vedicA.currentDasha.split(" / ").at(-1), "dated pratyantar must agree with the dasha string");
console.log("vedic unknown-time: angles withheld; golden dasha: Mars ends", goldenTimeline[0].end, ", Saturn maha starts", goldenTimeline[3].start);
assert.equal(vedicB.sunSign, "Gemini");
assert.equal(vedicB.moonNakshatra, "Anuradha");
assert.equal(vedicB.moonNakshatraPada, 3);
console.log("vedic A:", vedicA.sunSign, vedicA.moonSign, vedicA.moonNakshatra, vedicA.moonNakshatraPada, "| B:", vedicB.sunSign, vedicB.moonNakshatra, vedicB.moonNakshatraPada);

// M3.2: divisional charts on the golden case. Moon Aquarius 302.80:
// fixed sign, so D9 starts at the 9th from Aquarius (Libra), pada 0
// gives Libra; Aquarius is the 11th sign (odd-numbered), so D10
// starts at Aquarius itself, part 0 gives Aquarius. Sun Sagittarius
// 256.58: dual sign, so D9 starts at the 5th from Sagittarius
// (Aries), pada 4 gives Leo; Sagittarius is odd-numbered, so D10
// starts at itself, part 5 gives Taurus.
const vedicMoon = vedicA.planets.find((p) => p.name === "moon");
const vedicSun = vedicA.planets.find((p) => p.name === "sun");
assert.equal(navamsaSign(vedicMoon.longitude), "Libra", "golden Moon D9 must be Libra");
assert.equal(dasamsaSign(vedicMoon.longitude), "Aquarius", "golden Moon D10 must be Aquarius");
assert.equal(navamsaSign(vedicSun.longitude), "Leo", "golden Sun D9 must be Leo");
assert.equal(dasamsaSign(vedicSun.longitude), "Taurus", "golden Sun D10 must be Taurus");
assert.ok(vedicA.ascendantLongitude !== null, "known-time Vedic chart needs an ascendant longitude");
assert.equal(vedicA.divisional.lagnaD9, navamsaSign(vedicA.ascendantLongitude), "D9 Lagna must match the ascendant navamsa");
assert.equal(vedicA.divisional.lagnaD10, dasamsaSign(vedicA.ascendantLongitude), "D10 Lagna must match the ascendant dasamsa");
assert.equal(vedicUnknown.divisional.lagnaD9, null, "unknown-time D9 Lagna must be withheld");
assert.equal(vedicUnknown.divisional.lagnaD10, null, "unknown-time D10 Lagna must be withheld");
assert.ok(vedicUnknown.divisional.planets.length === 9, "unknown-time divisional planet signs still compute");
const TEST_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
for (const p of vedicA.divisional.planets) {
  const expectD9House = ((TEST_SIGNS.indexOf(p.d9) - TEST_SIGNS.indexOf(vedicA.divisional.lagnaD9) + 12) % 12) + 1;
  const expectD10House = ((TEST_SIGNS.indexOf(p.d10) - TEST_SIGNS.indexOf(vedicA.divisional.lagnaD10) + 12) % 12) + 1;
  assert.equal(p.d9House, expectD9House, `D9 house for ${p.name} must count from D9 Lagna`);
  assert.equal(p.d10House, expectD10House, `D10 house for ${p.name} must count from D10 Lagna`);
}
console.log("divisional golden: Moon D9 Libra, D10 Aquarius; Sun D9 Leo, D10 Taurus; D9 Lagna", vedicA.divisional.lagnaD9, "; D10 Lagna", vedicA.divisional.lagnaD10);

// M3.2: panchanga on the golden case. Sun 256.58, Moon 302.80:
// elongation 46.22 gives tithi index 3 (Shukla Chaturthi), Moon
// nakshatra Dhanishta, yoga index 14 (Vajra), karana index 7, which
// is Vishti: the karana cycle starts with Kimstughna at index 0,
// so index 7 is the seventh movable karana, not Bava. And
// 1990-01-01 was a Monday.
const panA = computePanchanga(256.5809, 302.7988, "1990-01-01");
assert.equal(panA.tithi, "Chaturthi", "golden tithi must be Chaturthi");
assert.equal(panA.paksha, "Shukla", "golden paksha must be Shukla");
assert.equal(panA.nakshatra, "Dhanishta", "golden panchanga nakshatra must be Dhanishta");
assert.equal(panA.yoga, "Vajra", "golden yoga must be Vajra");
assert.equal(panA.karana, "Vishti", "golden karana must be Vishti");
assert.equal(panA.vara, "Monday", "1990-01-01 must be a Monday");
console.log("panchanga golden:", panA.paksha, panA.tithi, "|", panA.nakshatra, "|", panA.yoga, "|", panA.karana, "|", panA.vara);
// M3.2: karana regression against published tables. At noon UTC on
// 2026-11-03 the elongation is about 290.9 degrees, and published
// panchanga tables for that day list Vanija running into the
// evening, not Vishti. The naive Bava-first mapping fails this;
// the Kimstughna-first mapping passes it.
const panNov = computePanchanga(196.8444, 127.7579, "2026-11-03");
assert.equal(panNov.tithi, "Dashami", "2026-11-03 tithi must be Dashami");
assert.equal(panNov.paksha, "Krishna", "2026-11-03 paksha must be Krishna");
assert.equal(panNov.nakshatra, "Magha", "2026-11-03 nakshatra must be Magha");
assert.equal(panNov.yoga, "Brahma", "2026-11-03 yoga must be Brahma");
assert.equal(panNov.karana, "Vanija", "2026-11-03 karana must be Vanija");
assert.equal(panNov.vara, "Tuesday", "2026-11-03 must be a Tuesday");
console.log("panchanga 2026-11-03:", panNov.paksha, panNov.tithi, "|", panNov.nakshatra, "|", panNov.yoga, "|", panNov.karana, "|", panNov.vara);

// M3.2: Gochara sign-based Drishti. Structural rule: every listed
// aspect must sit in its transit planet's rule set, and every house
// from the Moon must count in signs from the natal Moon sign.
const goA = computeGochara(vedicMoon.longitude, vedicA.planets.map((p) => ({ name: p.name, longitude: p.longitude })), "2026-11-03");
assert.equal(goA.date, "2026-11-03", "gochara must echo its date");
assert.ok(goA.planets.length === 9, "gochara needs all 9 grahas");
assert.ok(goA.panchanga.tithi && goA.panchanga.nakshatra && goA.panchanga.yoga && goA.panchanga.karana, "gochara must carry a full panchanga");
const DRISHTI_TEST = { sun: [7], moon: [7], mercury: [7], venus: [7], mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10], rahu: [7], ketu: [7] };
const natalMoonIdx = TEST_SIGNS.indexOf("Aquarius");
for (const t of goA.planets) {
  const expectHouse = ((TEST_SIGNS.indexOf(t.sign) - natalMoonIdx + 12) % 12) + 1;
  assert.equal(t.houseFromMoon, expectHouse, `house from Moon for transit ${t.name} must count in signs`);
  for (const a of t.aspects) {
    assert.ok((DRISHTI_TEST[t.name] ?? [7]).includes(a.housesAway), `transit ${t.name} must only aspect ${DRISHTI_TEST[t.name]} signs`);
  }
}
// Directional rule test: put a natal planet in the 4th sign from
// transit Mars and in the 6th sign from it. The 4th must be
// aspected (Mars rules 4, 7, 8); the 6th must not.
const marsT = goA.planets.find((p) => p.name === "mars");
const marsIdx = TEST_SIGNS.indexOf(marsT.sign);
const fourthLon = ((marsIdx + 3) % 12) * 30 + 5;
const sixthLon = ((marsIdx + 5) % 12) * 30 + 5;
const goMars = computeGochara(vedicMoon.longitude, [
  { name: "sun", longitude: fourthLon },
  { name: "moon", longitude: sixthLon },
], "2026-11-03");
const marsAspects = goMars.planets.find((p) => p.name === "mars").aspects;
assert.ok(marsAspects.some((a) => a.natalPlanet === "sun" && a.housesAway === 4), "transit Mars must aspect the 4th sign");
assert.ok(!marsAspects.some((a) => a.natalPlanet === "moon"), "transit Mars must not aspect the 6th sign");
assert.throws(() => computeGochara(vedicMoon.longitude, [], "2026-13-40"), /real calendar date/, "gochara with an invalid date must throw");
console.log("gochara 2026-11-03: transit Moon", goA.planets.find((p) => p.name === "moon").sign, "| Mars aspects:", marsAspects.map((a) => `${a.natalPlanet} ${a.housesAway}`).join(", ") || "(none)");

// Daily sun-sign: original Sortes text, deterministic per sign and date.
const dailyA = dailyHoroscope("Aries", "2026-11-01");
const dailyA2 = dailyHoroscope("Aries", "2026-11-01");
assert.equal(dailyA.theme, dailyA2.theme, "daily must be deterministic for the same sign and date");
assert.equal(dailyA.luckyNumber, undefined, "daily must not carry a lucky number (removed Phase 3)");
assert.equal(dailyA.luckyColour, undefined, "daily must not carry a lucky colour (removed Phase 3)");
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
// PushPrompt was deleted in Phase 3 (it only asked for Notification permission; no real Web Push exists).
assert.ok(!fs.existsSync(new URL("../src/components/PushPrompt.tsx", import.meta.url)), "PushPrompt must stay deleted");
const layoutSrc = fs.readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
assert.ok(!layoutSrc.includes("<PushPrompt") && !layoutSrc.includes("from \"./PushPrompt\"") && !layoutSrc.includes("from \"../components/PushPrompt\""), "layout must not mount PushPrompt");
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
  assert.ok(charts.includes("<details") && charts.includes("How your inputs are used"), "timezone disclosure must live in one collapsed block, not as two long blocks");
  // M0.2: the old blanket "no timezone database, no DST" wording was
  // false for Western (its library converts with a real timezone
  // database including DST). The disclosure must now state the
  // per-system truth instead of freezing the old wording.
  assert.ok(charts.includes("timezone database that includes DST rules"), "collapsed disclosure must state Western timezone database plus DST");
  assert.ok(charts.includes("longitude divided by 15 only"), "collapsed disclosure must state Vedic longitude-only conversion");
  assert.ok(charts.includes("longitude correction only"), "collapsed disclosure must state Ziwei longitude-only correction");
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
  const credits = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  // Audit 4 supersedes the Audit 3 btn-secondary note: all Buy buttons
  // are now the same solid btn-gold, popular distinguished by badge only.
  assert.ok(!credits.includes("btn-secondary"), "Audit 4: credits Buy buttons must no longer use btn-secondary");
  // Direct checkout added disabled:opacity-60 to the same solid button,
  // so accept that suffix. The button is still solid btn-gold, same size
  // and weight, in all three pack cards.
  // Visual corrections: the button moved into an mt-auto wrapper so
  // all three buttons sit on one line; the button itself keeps the
  // same solid btn-gold size and weight.
  // Phase F (P1-2, P1-8): the button is now py-3 (44px touch target)
  // with an opaque disabled style (opacity-100 + saturate-50) instead
  // of py-2.5 and disabled:opacity-60. The assertion tracks the new
  // intended classes exactly; it still pins one shared class string
  // for all three pack cards, so it is not weakened.
  assert.ok(credits.includes('className="btn-gold w-full rounded-xl px-4 py-3 font-bold disabled:opacity-100 disabled:saturate-50"'), "all credits Buy buttons must be solid btn-gold, equal size and weight");
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
  // Phase 4C (4.6): the TarotFan scroll fan is gone; the daily teaser
  // is a static fan in the homepage itself, same five cards, same
  // phone-width geometry (72 + 4 x 48 = 264px, inside 328px content
  // width), with no TarotFan import. (Comments may still name the
  // removed component; the import is what matters.)
  assert.ok(!home.includes('from "@/components/TarotFan"') && home.includes("w-[4.5rem]") && home.includes("-ml-6"), "daily teaser must be a static fan in the homepage, narrow enough for a 360px phone, with no TarotFan import");
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
  const credits = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  assert.ok(!credits.includes('bg-gold/10'), "popular credits card must carry no extra gold tint; badge is the only distinction");
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(layout.split("dangerouslySetInnerHTML").length - 1 === 1 && layout.includes('type="application/ld+json"'), "layout may use dangerouslySetInnerHTML only once, for JSON-LD, never for the theme script");
  assert.ok(layout.includes('/theme.js'), "theme script must load from the static public/theme.js file");
  assert.ok(fs.existsSync("public/theme.js"), "public/theme.js must exist");
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("--font-number"), "number font token must exist in globals.css");
  assert.ok(css.includes("tabular-nums"), "numbers must use tabular figures");
  const readingText = fs.readFileSync("src/components/ReadingText.tsx", "utf8");
  assert.ok(!readingText.includes("TypewriterText"), "reading text must not reference the removed typewriter");
  assert.ok(readingText.includes("renderReadingBlocks"), "reading text must render parsed blocks");
  assert.ok(!readingText.includes("<button"), "reading text must render statically, with no reveal button");
  const burst = fs.readFileSync("src/components/CardBurst.tsx", "utf8");
  assert.ok(!burst.includes("Math.random()"), "CardBurst must not call Math.random during render");
  const share = fs.readFileSync("src/components/ShareReading.tsx", "utf8");
  assert.ok(share.includes("next/image") || share.includes("from \"next/image\""), "share card must use next/image, not a raw img element");
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.ok(auth.includes("authConfigured"), "auth must expose a fail-fast configured check");
  console.log("audit5+aislop: custom wheel stagger, Chinese legend heading, interpretation language note, credits tint removed, static theme script, number font, static reading text, deterministic burst, share next/image, auth fail-fast: all source assertions passed");
}

// Audit 6 batch (PR #8): wheel label separation, list intro reword,
// sign-in link copy + dev code fallback, collapsed charts intro with Use example on top.
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
  assert.ok(account.includes("We will send a sign-in link"), "account page must indicate that a sign-in link will be sent");
  assert.ok(account.includes("We sent a {codeLength}-digit code to"), "account page dev fallback must indicate that a code was sent");
  assert.ok(!account.includes("Code field preview"), "account page must not show a dead code-field preview (removed Phase 3.2)");
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.ok(auth.includes('padStart(6, "0")'), "code length preview must match auth.ts: 6 digits");
  const charts = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(charts.includes("How your inputs are used"), "long charts intro must be collapsed behind a details summary");
  assert.ok(charts.includes("timezone database that includes DST rules"), "per-system timezone truth must stay reachable inside the one collapsed block");
  const useExampleIdx = charts.indexOf("Use example: 1990-01-01, 08:00, Manila");
  const birthDateIdx = charts.indexOf('id="chart-date"');
  assert.ok(useExampleIdx > 0 && useExampleIdx < birthDateIdx, "Use example must sit at the top of the form, before the first field, so it is visible without scrolling");
  console.log("audit6: wheel 12-degree separation, As in from rim, Mc tangent nudge, list intro reworded, sign-in link copy + dev code fallback, collapsed charts intro, Use example on top: all source assertions passed");
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
  // Batch 10: AI-slop and text trim. Short copy, no slop tics, privacy kept.
  const home = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(!home.includes("reimagined for the modern seeker"), "home hero must drop the reimagined/modern-seeker slop line");
  assert.ok(!home.includes("139,92,246"), "home hero must drop the violet AI purple glow, gold only");
  assert.ok(home.includes("Draw a free daily card"), "home hero must keep the short one-line pitch");
  const flow = fs.readFileSync("src/components/ReadingFlow.tsx", "utf8");
  assert.ok(!flow.includes("Unlock"), "reading flow must not use Unlock wording");
  const spreads = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(!spreads.includes("unlocks"), "spreads credit note must not use unlocks wording");
  // Codex P2 fix supersedes the old in-memory-only line: birth
  // details are now honestly disclosed as remembered on device.
  assert.ok(charts.includes("remembered on this device"), "charts privacy must stay, disclosing on-device retention");
  // Merge resolution fix: PR 50's disclosed wording wins on main
  // ("AI gets only chart positions"), so the old PR 54 pin for the
  // pre-merge wording ("AI gets chart") no longer matches. The
  // disclosure itself is unchanged and still checked below.
  assert.ok(charts.includes("AI gets only chart positions") && charts.includes("never birth data"), "charts privacy must stay, in one short line (storage wording is PR 50's disclosed version)");

  console.log("batch10: slop trim, short copy, privacy kept: all source assertions passed");
  // Batch 11: validator fixes, plus the fan. No ReactDrops code copied.
  const deck = fs.readFileSync("src/app/deck/page.tsx", "utf8");
  assert.ok(deck.includes('className="relative block aspect-[3/5] w-full"'), "deck tiles must use span, not div, inside the button");
  assert.ok(!deck.includes('<div className="relative aspect-[3/5]'), "deck tiles must not put a div inside the button");
  const tarotCard = fs.readFileSync("src/components/TarotCard.tsx", "utf8");
  assert.ok(tarotCard.includes("motion.span"), "tarot flip container must be a span, not a div, inside the button");
  assert.ok(charts.includes('role="group"'), "chart button groups must carry role=group with their aria-label");
  const css11 = fs.readFileSync("src/app/globals.css", "utf8");
  assert.ok(css11.includes(".alert-error-text") && css11.includes("#991b1b"), "error text must be theme-aware, dark red in light mode for contrast");
  // Phase 4C (4.6): the TarotFan component file is deleted; the static
  // fan lives in the homepage (asserted above), so there is no fan file
  // to check here anymore.
  console.log("batch11: validator fixes and tarot fan: all source assertions passed");
  // Batch 14: Lightsite fixes. JSON-LD in layout, credits H1 on server.
  const layout14 = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(layout14.includes('"@type": "Organization"') && layout14.includes('"@type": "WebSite"'), "layout must carry Organization and WebSite JSON-LD");
  const creditsPage = fs.readFileSync("src/app/oracles/page.tsx", "utf8");
  assert.ok(creditsPage.includes("<h1") && creditsPage.includes("Your balance"), "credits H1 must render in the server page, not only in the suspending client");
  const creditsClient = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  assert.ok(!creditsClient.includes("<h1"), "credits client must not duplicate the server H1");
  console.log("batch14: lightsite JSON-LD and credits server H1: all source assertions passed");
  // Phase 1: dead typed URLs must redirect, not 404.
  const config = fs.readFileSync("next.config.ts", "utf8");
  for (const slug of ["/daily-card", "/charts/western", "/charts/vedic", "/charts/ziwei", "/spreads/three-card", "/spreads/relationship", "/guides/how-tarot-works", "/guides/how-to-read-a-spread", "/intake"]) {
    assert.ok(config.includes(`source: "${slug}"`), `next.config must redirect dead slug ${slug}`);
  }
  const notFound = fs.readFileSync("src/app/not-found.tsx", "utf8");
  assert.ok(notFound.includes('title: "Page not found"'), "not-found page must carry its own title, not the home title");
  assert.ok(!notFound.includes('title: "Page not found | Sortes"'), "not-found title must not embed the suffix (root template appends it; fixed Phase 3.4)");
  assert.ok(notFound.includes('href: "/daily"') && notFound.includes('href: "/guides"'), "not-found page must offer real places to go, not only home");
  console.log("phase1: dead URL redirects and not-found places: all source assertions passed");
  // Phase 2: one dominant hero action, Oracle cash value, trust strip.
  assert.ok(home.includes("one dominant action"), "home hero must note the single primary action");
  assert.ok(home.includes("$3.99 for 5 Oracles"), "home hero must state the pack start price in cash terms");
  assert.ok(!home.includes("$0.80 per Oracle") || home.includes("varies by"), "home must not present a single fixed per-Oracle price as fixed");
  assert.ok(home.includes("For reflection, not prediction."), "home must still state reflection, not prediction, in one short line");
  assert.ok(!home.includes("What Sortes will, and will not, do"), "Batch E simplification: the repeating trust strip is removed, its claims live once in hero, spreads, credits, and footer");
  assert.ok(!home.includes("testimonial") && !home.includes("customers say"), "trust strip must not invent testimonials");
  console.log("phase2: homepage primary action, Oracle value, trust strip: all source assertions passed");
  // Phase 3: skip link, visible search labels, keyboard hints.
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(layout.includes('href="#main-content"') && layout.includes('id="main-content"'), "layout must carry a skip link to the main content");
  const guidesSearch = fs.readFileSync("src/components/GuidesSearch.tsx", "utf8");
  assert.ok(guidesSearch.includes('htmlFor="guides-search"'), "guides search must have a visible label, not only a placeholder");
  const deckPage = fs.readFileSync("src/app/deck/page.tsx", "utf8");
  assert.ok(deckPage.includes('htmlFor="deck-search"'), "deck search must have a visible label, not only a placeholder");
  console.log("phase3: skip link, visible search labels, keyboard hints: all source assertions passed");
  // Phase 4: new React Bits patterns, no new dependencies.
  const reactBitsNew = fs.readFileSync("src/components/ReactBitsNew.tsx", "utf8");
  // Phase 4C (4.6/4.7): GradientText and Magnet were deleted (both were
  // homepage-only); ReactBitsNew must still export SpotlightCard and
  // PageTransition, which are used on the journal page and in the layout.
  // (Comments may still name the removed exports; the export is what
  // matters.)
  assert.ok(reactBitsNew.includes("SpotlightCard") && reactBitsNew.includes("PageTransition") && !reactBitsNew.includes("export function GradientText") && !reactBitsNew.includes("export function Magnet"), "ReactBitsNew must export SpotlightCard and PageTransition; GradientText and Magnet were removed in Phase 4C");
  assert.ok(reactBitsNew.includes("prefers-reduced-motion"), "new components must gate on reduced motion");
  const pkg = fs.readFileSync("package.json", "utf8");
  assert.ok(!pkg.includes('"ogl"') && !pkg.includes('"three"') && !pkg.includes('"lenis"'), "Phase 4 must not add ogl, three, or lenis to package.json");
  assert.ok(pkg.includes('"motion": "^14.9.0"'), "Motion must stay at 14.9.0 after Phase 4");
  console.log("phase4: React Bits expansion, no new dependencies, Motion locked: all source assertions passed");
  // Phase 5: spreads discoverability, reading hint, no data changes.
  const spreadsClient = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(spreadsClient.includes("View spread detail"), "locked spread cards must link to their detail page");
  assert.ok(spreadsClient.includes("Get Oracles to begin"), "locked spread cards must still offer Oracles first");
  const intake = fs.readFileSync("src/app/intake/[slug]/IntakeFlow.tsx", "utf8");
  assert.ok(intake.includes("Reversed cards are shown upside down"), "impression step must explain the reversed visual cue");
  console.log("phase5: spreads discoverability, reversed hint: all source assertions passed");
  // Personal Phase 1: structured reflection, at-a-glance facts,
  // repeated questions, plain-words chart jump. No pricing, credit,
  // auth, spread, or calculation changes.
  const generateRoute = fs.readFileSync("src/app/api/reading/generate/route.ts", "utf8");
  assert.ok(generateRoute.includes("What stands out for your question"), "generation prompt must ask what stands out for the seeker's question");
  assert.ok(generateRoute.includes("what you may be overlooking"), "generation prompt must ask what the seeker may be overlooking");
  assert.ok(generateRoute.includes("one practical step you could take"), "generation prompt must ask for one practical step");
  assert.ok(!generateRoute.includes("guaranteed prediction") || generateRoute.includes("NEVER as guaranteed prediction"), "generation prompt must keep the reflection, not prediction, guardrail");
  const readingDetail = fs.readFileSync("src/app/reading/[id]/ReadingDetailClient.tsx", "utf8");
  assert.ok(readingDetail.includes("About this reading, at a glance") && readingDetail.includes("computeSpreadFacts"), "reading detail must show computed at-a-glance facts from the draw");
  const historyClient = fs.readFileSync("src/app/journal/HistoryClient.tsx", "utf8");
  assert.ok(historyClient.includes("Questions you keep returning to"), "journal must surface repeated questions");
  const chartsClient = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(chartsClient.includes('href="#chart-interpretation"') && chartsClient.includes('id="chart-interpretation"'), "charts result must offer a jump to the plain-words interpretation");
  console.log("personal-phase1: structured reflection, at-a-glance facts, repeated questions, chart jump: all source assertions passed");
  // Personal Phase 2: progressive disclosure, number containers,
  // React Bits integration, chart plain-words structure, intake guidance.
  const chartRoute = fs.readFileSync("src/app/api/chart/interpret/route.ts", "utf8");
  assert.ok(chartRoute.includes("what they may be overlooking"), "chart prompt must ask what the seeker may be overlooking");
  assert.ok(chartRoute.includes("one practical step they could take"), "chart prompt must ask for one practical step");
  assert.ok(readingDetail.includes("Traditional meaning, if you want it"), "reading card sections must disclose traditional meanings behind one tap, not hide them");
  // Deep UX Batch A, doc item 7: FadeContent was replaced by the
  // rise AnimatedContent, which is also reduced-motion gated.
  assert.ok(readingDetail.includes("AnimatedContent"), "reading at-a-glance must use the reduced-motion-gated reveal");
  assert.ok(historyClient.includes("SpotlightCard"), "journal repeated questions must use the spotlight interaction");
  assert.ok(chartsClient.includes("Show the full legend"), "chart legend must be progressive disclosure, not a wall before interpretation");
  assert.ok(intake.includes("What happens next: cards are drawn"), "intake confirm step must state what happens next");
  console.log("personal-phase2: disclosure, numbers, React Bits, chart structure, intake guidance: all source assertions passed");
  // Personal Phase 3: guided navigation, guide contents, card
  // padding consistency, GlareHover and AnimatedList samples.
  const spreadsClient2 = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(spreadsClient2.includes("Start here, it is free") && spreadsClient2.includes("GlareHover"), "spreads must offer one guided free start with a glare interaction");
  const daily = fs.readFileSync("src/app/daily/page.tsx", "utf8");
  assert.ok(daily.includes("Ask a full reading about this"), "daily reveal must offer a next step instead of ending at tomorrow");
  const guidePage = fs.readFileSync("src/app/guides/[slug]/page.tsx", "utf8");
  assert.ok(guidePage.includes("In this guide") && guidePage.includes("scroll-mt-24"), "guide pages must carry a contents list with anchored sections");
  assert.ok(reactBitsNew.includes("GlareHover") && reactBitsNew.includes("AnimatedList"), "ReactBitsNew must export GlareHover and AnimatedList");
  const guidesSearch2 = fs.readFileSync("src/components/GuidesSearch.tsx", "utf8");
  assert.ok(guidesSearch2.includes("AnimatedList"), "guides index must use the animated list");
  assert.ok(!pkg.includes('"ogl"') && !pkg.includes('"lenis"'), "Phase 3 must not add ogl or lenis");
  console.log("personal-phase3: guided navigation, guide contents, GlareHover, AnimatedList: all source assertions passed");
  // Personal Phase 4: guide cost warnings, FAQ expand all and
  // anchors, spread disclaimer. No pricing, credit, or copy changes
  // beyond stating the confirmed costs.
  const guidePage2 = fs.readFileSync("src/app/guides/[slug]/page.tsx", "utf8");
  assert.ok(guidePage2.includes("Cost before you try it") && guidePage2.includes("celtic-cross-explained") && guidePage2.includes("tarot-and-birth-charts") && guidePage2.includes("topic-spreads-love-career-week"), "the three cost guides must carry a cost warning up front");
  const faqPage = fs.readFileSync("src/app/faq/page.tsx", "utf8");
  assert.ok(faqPage.includes("FaqList"), "FAQ must use the expandable list component");
  const faqList = fs.readFileSync("src/components/FaqList.tsx", "utf8");
  assert.ok(faqList.includes("Expand all") && faqList.includes("Collapse all") && faqList.includes("Jump to a question"), "FAQ must offer expand all, collapse all, and anchor links");
  assert.ok(spreadsClient2.includes("For reflection, not prediction."), "spreads index must carry the reflection disclaimer, in one short line");
  console.log("personal-phase4: guide costs, FAQ controls, spread disclaimer: all source assertions passed");
  // Deep UX Batch A: doc colours, Rise config, FadeContent
  // replaced, PixelCard credits to doc spec.
  const glide = fs.readFileSync("src/components/GlideSelect.tsx", "utf8");
  assert.ok(glide.includes("accentColor = '#d4af37'") && glide.includes("surfaceColor = '#1a1f2e'"), "GlideSelect defaults must be Sortes colours, not demo zinc");
  const spiral = fs.readFileSync("src/components/InfiniteSpiral.tsx", "utf8");
  assert.ok(spiral.includes("border-gold/25 bg-panel/70") && !spiral.includes("bg-white/10"), "deck spiral must use Sortes tokens, not demo white");
  assert.ok(!fs.readFileSync("src/app/reading/[id]/ReadingDetailClient.tsx", "utf8").includes("FadeContent"), "FadeContent must be replaced, not left in reading detail");
  const credits = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  assert.ok(!credits.includes("<PixelCard"), "popular Oracles card must not render a gold PixelCard (removed Phase 2.5: gold-on-gold was 1.00:1)");
  assert.ok(credits.includes("border-gold/70 bg-panel/80"), "popular Oracles card must be a dark panel with a gold border");
  console.log("deep-ux-batch-a: Sortes colours, Rise config, FadeContent replaced, PixelCard spec: all source assertions passed");
  // Deep UX Batch A2: daily reveal and typing, Orb, charts cache,
  // single Oracle rules entry.
  const dailyPage = fs.readFileSync("src/app/daily/page.tsx", "utf8");
  assert.ok(!dailyPage.includes('from "@/components/PixelTransition"') && dailyPage.includes("rotateY") && !dailyPage.includes("typingSpeed") && !dailyPage.includes("TextType"), "daily must use a flip reveal with full-text fade-in, no typewriter (removed Phase 2.2)");
  const reactBitsNew2 = fs.readFileSync("src/components/ReactBitsNew.tsx", "utf8");
  assert.ok(reactBitsNew2.includes("export function Orb"), "ReactBitsNew must export Orb");
  const homePage = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(homePage.includes("<Orb />"), "home hero must use Orb");
  const chartsClient2 = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(chartsClient2.includes("systemCache") && chartsClient2.includes("sortes-birth-details"), "charts must cache per-system results and remember birth details");
  const faqPage2 = fs.readFileSync("src/app/faq/page.tsx", "utf8");
  assert.ok(faqPage2.includes("What are the five Oracle rules?"), "FAQ must state all five Oracle rules in one place");
  console.log("deep-ux-batch-a2: daily reveal and typing, Orb, charts cache, Oracle rules: all source assertions passed");
  // Deep UX Batch B: grouped mobile nav, footer route labels, home
  // return loop, journal search and sort, report sample, cross-links.
  // Report detail H1 was checked in this pass: it renders via
  // SplitText tag="h1", so the audit's literal h1 grep missed it.
  const header = fs.readFileSync("src/components/Header.tsx", "utf8");
  assert.ok(header.includes("const GROUPS") && header.includes('label: "Tarot"') && header.includes('label: "Astrology"') && header.includes('label: "Learn"') && header.includes("BranchedMenu"), "mobile menu must be grouped by job (Tarot / Astrology / Learn groups; Phase 4A replaced the old Reflect/Understand/Explore/Keep labels)");
  const footer = fs.readFileSync("src/components/Footer.tsx", "utf8");
  // Unified names (review fix): Spreads, Journal, Oracles everywhere,
  // replacing the old footer-only Credits/History labels.
  assert.ok(footer.includes(">Deck<") && footer.includes(">Oracles<") && footer.includes(">Journal<") && footer.includes(">Spreads<"), "footer labels must use the unified names");
  const homeBatchB = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(homeBatchB.includes("<ReturnLoop />"), "home must show the return loop");
  const historyClientB = fs.readFileSync("src/app/journal/HistoryClient.tsx", "utf8");
  assert.ok(historyClientB.includes('id="journal-search"') && historyClientB.includes('id="journal-sort"'), "journal must offer search and sort");
  const reportsClient = fs.readFileSync("src/app/reports/ReportsClient.tsx", "utf8");
  assert.ok(reportsClient.includes("Read a sample report, before you spend an Oracle") && reportsClient.includes("SAMPLE_TRANSIT_REPORT"), "reports must show a full sample report before spending");
  const reportDetail = fs.readFileSync("src/app/reports/[id]/ReportDetailClient.tsx", "utf8");
  assert.ok(reportDetail.includes('tag="h1"'), "report detail must render an h1 via SplitText");
  const readingDetailB = fs.readFileSync("src/app/reading/[id]/ReadingDetailClient.tsx", "utf8");
  assert.ok(readingDetailB.includes("Cast a birth chart for it"), "reading detail must link to charts");
  console.log("deep-ux-batch-b: grouped nav, return loop, journal scale, report sample, cross-links: all source assertions passed");
  // Deep UX Batch C: spreads picker, intake clarity, reading
  // hierarchy note, accessibility target sizes. Variable names here
  // carry the BatchC suffix because this check file reuses short
  // names across groups in one scope.
  const spreadsBatchC = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(spreadsBatchC.includes("What are you asking about?") && spreadsBatchC.includes("spread-") && spreadsBatchC.includes("Positions in this spread"), "spreads must offer a question picker and disclose positions");
  const intakeBatchC = fs.readFileSync("src/app/intake/[slug]/IntakeFlow.tsx", "utf8");
  assert.ok(intakeBatchC.includes("Ask like this") && intakeBatchC.includes("Nothing has been charged yet") && intakeBatchC.includes('aria-label="Reading steps"') && !intakeBatchC.includes('aria-hidden="true"'), "intake must show examples, state nothing charged yet, and expose step progress");
  const readingBatchC = fs.readFileSync("src/app/reading/[id]/ReadingDetailClient.tsx", "utf8");
  assert.ok(readingBatchC.includes("Your story is not shown here on purpose") && readingBatchC.includes("revisit note"), "reading detail must explain the absent story and the revisit gate");
  const headerBatchC = fs.readFileSync("src/components/Header.tsx", "utf8");
  assert.ok(headerBatchC.includes("rounded-lg p-3") && headerBatchC.includes("h-11 w-11"), "header controls must reach 44px targets");
  console.log("deep-ux-batch-c: spreads picker, intake clarity, reading note, target sizes: all source assertions passed");

  // Deep UX Batch D (review fixes): InstallBanner must not obscure
  // focused content at the foot of the page.
  const installBannerD = fs.readFileSync("src/components/InstallBanner.tsx", "utf8");
  assert.ok(installBannerD.includes("ResizeObserver") && installBannerD.includes("document.body.style.paddingBottom"), "InstallBanner must reserve its measured height as body padding while shown so focused content scrolls above it");
  // Phase 4C (4.6c): the install banner appears only after the seeker
  // has completed at least one reading, from existing storage state
  // (journal entries or the free-reading-used flag), never before.
  assert.ok(installBannerD.includes("hasCompletedReading") && installBannerD.includes("getHistory") && installBannerD.includes("freeReadingUsed"), "InstallBanner must gate on a completed reading (journal or free-reading-used flag) before showing");
  console.log("deep-ux-batch-d: InstallBanner focus-obscured fix: all source assertions passed");

}

// Batch E (PR 54): global content simplification, show don't explain.
{
  const homeE = fs.readFileSync("src/app/page.tsx", "utf8");
  assert.ok(!homeE.includes("What Sortes will, and will not, do"), "Batch E: home trust strip removed");
  assert.ok(homeE.includes("For reflection, not prediction."), "Batch E: home keeps one short reflection line");
  const spreadsE = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(spreadsE.includes("First Quick Insight free. After that, 1 Oracle per reading, any spread."), "Batch E: spreads intro shortened");
  assert.ok(spreadsE.includes("See all five Oracle rules"), "Batch E: spreads bottom section links to the full rules");
  assert.ok(!spreadsE.includes("You pay only for Oracle packs, never per reading, never twice."), "Batch E: spreads long Oracle paragraph removed");
  const chartsE = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(!chartsE.includes("Before you calculate, please note"), "Batch E: duplicate charts timezone block removed");
  assert.ok(chartsE.includes("How your inputs are used"), "Batch E: one collapsed charts inputs block remains");
  const creditsE = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  // Batch F supersedes the Batch E wording: the merged credits page
  // states inclusions as "works for", not "includes".
  assert.ok(creditsE.includes("Every pack works for tarot readings, birth charts, and reports."), "Batch E: pack inclusions stated once above the grid");
  assert.ok(!creditsE.includes("Tarot readings, birth charts, and reports included"), "Batch E: identical pack bullets removed from cards");
  console.log("deep-ux-batch-e: global simplification: all source assertions passed");

}

// Deep UX Batch F (PR 55): credits density, carried from the PR branch.
{
// Deep UX Batch F: credits density. Compact balance row with one short
  // explanation plus a rules link, 3-column pack grid with name, quantity,
  // price, per-Oracle price and checkout only. Phase E (item 9) overrides
  // the old "no sample on the money page" rule: the same shared
  // SampleReading component from the home page is embedded here, so
  // visitors weighing a pack see what a reading reads like first.
  const creditsF = fs.readFileSync("src/app/oracles/CreditsClient.tsx", "utf8");
  assert.ok(creditsF.includes("See all five Oracle rules"), "credits must link the Oracle rules");
  assert.ok(creditsF.includes("sm:grid-cols-3"), "credits packs must use a 3-column grid");
  assert.ok(creditsF.includes("SampleReading"), "credits must embed the shared sample reading");
  assert.ok(!creditsF.includes("PACK_TAGLINES"), "credits must not carry pack taglines");
  assert.ok(!creditsF.includes("Free first follow-up"), "credits must not repeat the full rules list");
  // Visual corrections follow-up: pack prices are static text, never
  // the rolling Counter (its intro spin rendered scattered digits in
  // captures); cards stretch to one row height with bottom-aligned
  // buttons, and the popular card is distinguished by colour, border,
  // shadow, and badge, not by a taller box.
  assert.ok(!creditsF.includes('prefix="$"'), "credits pack prices must be static text, not a rolling Counter");
  assert.ok(creditsF.includes("items-stretch"), "credits pack grid must stretch cards to equal height");
  assert.ok(creditsF.includes("mt-auto"), "credits Checkout buttons must align at the card foot");
  assert.ok(!creditsF.includes("minHeight"), "popular Oracles card must not keep any PixelCard minimum height (PixelCard removed Phase 2.5)");
  console.log("deep-ux-batch-f: credits density: all source assertions passed");
}

// Codex re-review follow-ups (post-merge, 2026-11-04): fixes for the
// new findings Codex posted on the PR 50 to 53 fix commits.
{
  const chartsRR = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(chartsRR.includes("requestSystem === systemRef.current"), "pending chart calculations must be discarded when the system changes mid-request");
  assert.ok(chartsRR.includes("setInterpFailed(cached.interpFailed)"), "cached systems must restore their retry flags with the interpretation");
  const historyRR = fs.readFileSync("src/app/journal/HistoryClient.tsx", "utf8");
  assert.ok(historyRR.includes('search.trim() !== ""'), "journal no-match message must require an active search");
  const spreadsRR = fs.readFileSync("src/app/spreads/SpreadsClient.tsx", "utf8");
  assert.ok(spreadsRR.includes('usedFree ? "Quick Insight"'), "spreads picker must stop advertising a used free reading as free");
  const bannerRR = fs.readFileSync("src/components/InstallBanner.tsx", "utf8");
  assert.ok(bannerRR.includes("rect.left < bannerRect.right"), "InstallBanner focus nudge must check full rectangle overlap, not only vertical");
  console.log("codex re-review follow-ups: all source assertions passed");
}

// Phase F: touch targets, opaque disabled states, contrast floor,
// responsive SlideCommit, table affordances, PurchaseConfirmer baseline,
// Orb single loop, share fonts, HoloCard dead props, PixelCard deleted,
// reduced-motion guards, Sortes defaults.
{
  // 1 & 2: src-wide scans for opaque disabled states and contrast floor
  const srcFiles = [];
  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        srcFiles.push({ path: fullPath, content: fs.readFileSync(fullPath, "utf8") });
      }
    }
  }
  walkDir("src");

  // 1. No file under src/ contains disabled:opacity-40, 50, or 60
  assert.ok(
    !srcFiles.some(
      (f) =>
        f.content.includes("disabled:opacity-40") ||
        f.content.includes("disabled:opacity-50") ||
        f.content.includes("disabled:opacity-60")
    ),
    "Phase F: no disabled:opacity-* may remain in src (disabled states must stay opaque)"
  );

  // 2. No file under src/ contains text-cream/60 or text-cream/70
  assert.ok(
    !srcFiles.some(
      (f) =>
        f.content.includes("text-cream/60") ||
        f.content.includes("text-cream/70")
    ),
    "Phase F: secondary text must use text-cream/75 or higher"
  );

  // 3. PixelCard stays deleted
  assert.ok(!fs.existsSync(new URL("../src/components/PixelCard.tsx", import.meta.url)), "PixelCard must stay deleted (Phase F P2-4: zero page use)");

  // 4. FoldText stays live
  const readingWaitSrc = fs.readFileSync("src/components/ReadingWait.tsx", "utf8");
  assert.ok(readingWaitSrc.includes('from "@/components/FoldText"'), "ReadingWait must include FoldText");

  // 5. Touch targets
  const deckPageSrc = fs.readFileSync("src/app/deck/page.tsx", "utf8");
  assert.ok(deckPageSrc.includes("px-3 py-3"), "deck page filter pills must meet touch targets");
  assert.ok(deckPageSrc.includes("px-4 py-3"), "deck page view toggle must meet touch targets");
  const cardModalSrc = fs.readFileSync("src/components/CardModal.tsx", "utf8");
  assert.ok(cardModalSrc.includes("h-11 w-11"), "CardModal must include h-11 w-11");
  const intakeFlowSrc = fs.readFileSync("src/app/intake/[slug]/IntakeFlow.tsx", "utf8");
  assert.ok(intakeFlowSrc.includes("min-h-[44px]"), "IntakeFlow must include min-h-[44px]");
  const rubberSegmentSrc = fs.readFileSync("src/components/RubberSegment.tsx", "utf8");
  assert.ok(rubberSegmentSrc.includes("min-h-[max(44px,calc(var(--rs-h)-var(--rs-inset)*2))]"), "RubberSegment must include 44px min-h");
  // 5b. No py-2 pill or tab button may remain in the charts, account,
  // daily, or header files (Phase F correction: Batch A skipped the
  // charts pills because the brief said py-2.5 and the code said py-2).
  const chartsSrc = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(!chartsSrc.includes("rounded-full px-4 py-2 "), "charts pills must not keep py-2 (44px touch target)");
  const accountSrc = fs.readFileSync("src/app/account/AccountClient.tsx", "utf8");
  assert.ok(!accountSrc.includes("px-4 py-2 "), "account buttons must not keep py-2 (44px touch target)");
  const dailySrc = fs.readFileSync("src/app/daily/page.tsx", "utf8");
  assert.ok(!dailySrc.includes("px-4 py-2 "), "daily buttons must not keep py-2 (44px touch target)");
  const headerSrc = fs.readFileSync("src/components/Header.tsx", "utf8");
  assert.ok(!headerSrc.includes("px-3 py-1.5 text-sm font-semibold text-goldbright transition hover:border-goldbright"), "header Retry button must not keep py-1.5 (44px touch target)");

  // 6. SlideCommit responsive width
  const slideCommitSrc = fs.readFileSync("src/components/SlideCommit.tsx", "utf8");
  assert.ok(
    slideCommitSrc.includes("ResizeObserver") &&
    slideCommitSrc.includes("maxWidth: width") &&
    slideCommitSrc.includes("width: '100%'") &&
    !slideCommitSrc.includes("style={\n        {\n          width,"),
    "SlideCommit must support responsive width and not force fixed root width"
  );

  // 7. Table affordances
  const westernWheelSrc = fs.readFileSync("src/components/WesternWheel.tsx", "utf8");
  const vedicChartSrc = fs.readFileSync("src/components/VedicChart.tsx", "utf8");
  const ziweiStacksSrc = fs.readFileSync("src/components/ZiweiStacks.tsx", "utf8");
  const reportDetailSrc = fs.readFileSync("src/app/reports/[id]/ReportDetailClient.tsx", "utf8");
  assert.ok(westernWheelSrc.includes('role="region"') && westernWheelSrc.includes("tabIndex={0}"), "WesternWheel must include role=region and tabIndex={0}");
  assert.ok(vedicChartSrc.includes('role="region"') && vedicChartSrc.includes("tabIndex={0}"), "VedicChart must include role=region and tabIndex={0}");
  assert.ok(ziweiStacksSrc.includes('role="region"') && ziweiStacksSrc.includes("tabIndex={0}"), "ZiweiStacks must include role=region and tabIndex={0}");
  assert.ok(reportDetailSrc.includes('role="region"') && reportDetailSrc.includes("tabIndex={0}"), "ReportDetailClient must include role=region and tabIndex={0}");

  // 8. PurchaseConfirmer baseline
  const purchaseConfirmerSrc = fs.readFileSync("src/components/PurchaseConfirmer.tsx", "utf8");
  assert.ok(
    purchaseConfirmerSrc.includes("/api/credits/transactions") &&
    purchaseConfirmerSrc.includes("created_at"),
    "PurchaseConfirmer must include /api/credits/transactions and created_at"
  );

  // 9. Orb single loop
  const reactBitsNewSrc = fs.readFileSync("src/components/ReactBitsNew.tsx", "utf8");
  assert.ok(!reactBitsNewSrc.includes("rotate: -360"), "ReactBitsNew must drop the second orb continuous loop");

  // 10. Reduced-motion guards
  const reducedMotionFiles = [
    "src/components/ReactBits.tsx",
    "src/components/ReactBitsNew.tsx",
    "src/components/Starfield.tsx",
    "src/components/SplitText.tsx",
    "src/components/Counter.tsx",
    "src/components/CountUp.tsx",
    "src/components/HoloCard.tsx",
    "src/components/MotionProvider.tsx",
    "src/components/AnimatedContent.tsx",
    "src/components/FoldText.tsx",
  ];
  for (const file of reducedMotionFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      content.includes("useReducedMotion") ||
      content.includes("prefers-reduced-motion") ||
      content.includes("reducedMotion"),
      file + " must guard motion with reduced motion checks"
    );
  }

  // 11. Share fonts
  const shareReadingSrc = fs.readFileSync("src/components/ShareReading.tsx", "utf8");
  const chartsClientSrc = fs.readFileSync("src/app/charts/ChartsClient.tsx", "utf8");
  assert.ok(
    shareReadingSrc.includes("Cormorant Garamond, Georgia, serif") &&
    chartsClientSrc.includes("Cormorant Garamond, Georgia, serif") &&
    !shareReadingSrc.includes('fontFamily: "Georgia, serif"') &&
    !chartsClientSrc.includes('fontFamily: "Georgia, serif"'),
    "ShareReading and ChartsClient must use Cormorant Garamond and not bare Georgia"
  );

  // 12. HoloCard dead props gone
  const holoCardSrc = fs.readFileSync("src/components/HoloCard.tsx", "utf8");
  assert.ok(
    !holoCardSrc.includes("edgeSparkle?:") &&
    !holoCardSrc.includes("void scale;") &&
    !holoCardSrc.includes("glare?:"),
    "HoloCard must drop unused props edgeSparkle, scale, glare"
  );

  // 13. Drawer link
  assert.ok(
    headerSrc.includes('aria-controls="mobile-nav"') &&
    headerSrc.includes('id="mobile-nav"'),
    "Header must connect mobile menu button to drawer via aria-controls and id"
  );

  // 14. Deck spiral
  assert.ok(
    deckPageSrc.includes("switch to Card grid above") &&
    deckPageSrc.includes('alt: ""'),
    "deck page must include keyboard hint for spiral and alt: '' for spiral items"
  );

  // 15. ThemedDatePicker
  const themedDatePickerSrc = fs.readFileSync("src/components/ThemedDatePicker.tsx", "utf8");
  assert.ok(
    themedDatePickerSrc.includes("max-h-[calc(100dvh-6rem)]"),
    "ThemedDatePicker must include max-h-[calc(100dvh-6rem)]"
  );

  // 16. Sortes defaults
  const holdButtonSrc = fs.readFileSync("src/components/HoldButton.tsx", "utf8");
  const specularButtonSrc = fs.readFileSync("src/components/SpecularButton.tsx", "utf8");
  const branchedMenuSrc = fs.readFileSync("src/components/BranchedMenu.tsx", "utf8");
  assert.ok(holdButtonSrc.includes("fillColor = '#d4af37'"), "HoldButton must default fillColor to #d4af37");
  assert.ok(specularButtonSrc.includes("baseColor = '#1a1f2e'"), "SpecularButton must default baseColor to #1a1f2e");
  assert.ok(slideCommitSrc.includes("handleColor = '#d4af37'"), "SlideCommit must default handleColor to #d4af37");
  assert.ok(branchedMenuSrc.includes("accentColor = '#d4af37'"), "BranchedMenu must default accentColor to #d4af37");
  assert.ok(rubberSegmentSrc.includes("thumbColor = '#d4af37'"), "RubberSegment must default thumbColor to #d4af37");

  console.log("phaseF: touch targets, opaque disabled, contrast floor, SlideCommit width, table affordances, PurchaseConfirmer baseline, Orb single loop, share fonts, HoloCard props, PixelCard deleted, reduced-motion guards: all source assertions passed");
}
