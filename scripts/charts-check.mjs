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
} from "../src/lib/ziwei-i18n.ts";
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

// Pricing: first chart per system free, then 1 credit.
assert.equal(chartInterpretationCost(false), 0, "first chart per system is free");
assert.equal(chartInterpretationCost(true), 1, "later charts cost 1 credit");

console.log("charts-check: all assertions passed");
