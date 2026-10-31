// Phase 1 chart check: assert-based self-check, no new test framework.
// Run: node scripts/charts-check.mjs
// It imports src/lib/charts.ts directly (Node 24 type stripping).
// Privacy: test birth data below is used only in-memory for this check;
// nothing here is stored, sent to AI, or written to a database.
import assert from "node:assert";
import { calculateZiwei, calculateWestern, timeIndexForHour } from "../src/lib/charts.ts";
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

console.log("charts-check: all assertions passed");
