"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ZiweiResult } from "@/lib/charts";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import {
  BRANCH_INFO,
  STEM_PINYIN,
  brightnessEn,
  formatChineseDateEn,
  formatLunarDateEn,
  formatTimeLabelEn,
  localizeMinorStar,
  localizeStar,
  mutagenEn,
  signEn,
  zodiacEn,
} from "@/lib/ziwei-i18n";
import { RING_CENTRE, RING_INNER, RING_OUTER, polar, sectorEnd, sectorStart, wedgePath } from "@/lib/ziwei-ring";
import { SQUARE_CELLS, squareCellForPalaceIndex } from "@/lib/ziwei-square";

export type ZiweiView = "ring" | "square";

// Circle chart, not the traditional 4x4 square layout: the same 12 palaces
// in iztro array order, clockwise from the top, around a centre disc.
// The ring is the overview; the detail panel below carries every field,
// so no palace text is crammed into a wedge. Language is display only:
// English is default for western clients, Chinese is the second option.
const LABELS: Record<
  ZiweiLanguage,
  {
    lunar: string;
    chineseDate: string;
    zodiac: string;
    sign: string;
    time: string;
    life: string;
    noMajor: string;
    empty: string;
    tap: string;
    unknown: string;
    note: string;
  }
> = {
  en: {
    lunar: "Lunar",
    chineseDate: "Stem-branch date",
    zodiac: "Zodiac",
    sign: "Western sign",
    time: "Birth time",
    life: "Life palace",
    noMajor: "No major stars (empty palace)",
    empty: "Empty",
    tap: "Tap a palace to see its full stars.",
    unknown: "Unknown birth time: calculated at noon, houses are approximate.",
    note: "Chart only, for reflection. Calculation is free and unsaved; interpretation, when you choose it below, is a separate step.",
  },
  zh: {
    lunar: "农历",
    chineseDate: "干支",
    zodiac: "生肖",
    sign: "西方星座",
    time: "出生时辰",
    life: "命宫",
    noMajor: "无主星（空宫）",
    empty: "空宫",
    tap: "点击宫位查看完整星曜。",
    unknown: "出生时间未知：按正午计算，宫位仅供参考。",
    note: "仅为星盘展示，供参考。计算免费且不保存；下方解读为单独步骤。",
  },
};

function primaryStar(star: string, lang: ZiweiLanguage): string {
  const l = localizeStar(star);
  return lang === "en" ? l.en : l.zh;
}

export default function ZiweiChartBoard({ result, lang = "en", view = "ring" }: { result: ZiweiResult; lang?: ZiweiLanguage; view?: ZiweiView }) {
  const t = LABELS[lang];
  const en = lang === "en";
  const reduce = useReducedMotion();
  const lunarEn = formatLunarDateEn(result.lunarDate);
  const life = result.palaces.find((p) => p.isLifePalace) ?? result.palaces[0];
  const [selected, setSelected] = useState(life.index);
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => {
    setSelected(life.index);
    // Reset only when a new chart arrives, not on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.solarDate, result.timeLabel]);
  const current = result.palaces.find((p) => p.index === selected) ?? life;
  const fade = reduce
    ? { initial: false as const, animate: { opacity: 1 } }
    : { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 } };

  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
        <span>
          {t.lunar}:{" "}
          <strong className="text-cream">{en ? (lunarEn ?? result.lunarDate) : result.lunarDate}</strong>{" "}
          <span className="text-cream/60">{en ? `(${result.lunarDate})` : lunarEn ? `(${lunarEn})` : ""}</span>
        </span>
        <span>
          {t.chineseDate}:{" "}
          <strong className="text-cream">{en ? formatChineseDateEn(result.chineseDate) : result.chineseDate}</strong>{" "}
          <span className="text-cream/60">{en ? `(${result.chineseDate})` : `(${formatChineseDateEn(result.chineseDate)})`}</span>
        </span>
        <span>
          {t.zodiac}:{" "}
          <strong className="text-cream">{en ? zodiacEn(result.zodiac) : result.zodiac}</strong>{" "}
          <span className="text-cream/60">{en ? `(${result.zodiac})` : `(${zodiacEn(result.zodiac)})`}</span>
        </span>
        <span>
          {t.sign}:{" "}
          <strong className="text-cream">{en ? signEn(result.sign) : result.sign}</strong>{" "}
          <span className="text-cream/60">{en ? `(${result.sign})` : `(${signEn(result.sign)})`}</span>
        </span>
        <span>
          {t.time}:{" "}
          <strong className="text-cream">{en ? formatTimeLabelEn(result.timeLabel) : result.timeLabel}</strong>{" "}
          <span className="text-cream/60">{en ? `(${result.timeLabel})` : `(${formatTimeLabelEn(result.timeLabel)})`}</span>
        </span>
        {result.unknownTime && <span className="text-goldbright">{t.unknown}</span>}
      </div>

      <p className="mt-4 text-sm text-cream/60">{t.tap}</p>
      {view === "square" && (
        <div className="mx-auto mt-4 grid w-full max-w-[640px] grid-cols-4 gap-1.5" role="grid" aria-label={en ? "Ziwei square chart" : "紫微斗数方盘"}>
          {result.palaces.map((p) => {
            const cell = squareCellForPalaceIndex(result.palaces.indexOf(p));
            const stars = p.majorStars.map((s) => primaryStar(s, lang));
            const isSel = p.index === selected;
            return (
              <button
                key={p.index}
                type="button"
                onClick={() => setSelected(p.index)}
                aria-pressed={isSel}
                style={{ gridRow: cell.row, gridColumn: cell.col }}
                className={`min-h-[104px] rounded-xl border px-2 py-2 text-left ${
                  isSel ? "border-gold/60 bg-gold/10" : "border-gold/25 bg-panel/70"
                }`}
              >
                <span className={`block text-sm font-bold ${p.isLifePalace ? "text-goldbright" : "text-cream"}`}>
                  {en ? p.name : p.chineseName}
                  {p.isLifePalace && " ✦"}
                </span>
                <span className="mt-0.5 block text-[11px] text-mist">
                  {en ? `${STEM_PINYIN[p.heavenlyStem] ?? p.heavenlyStem} ${BRANCH_INFO[p.earthlyBranch]?.pinyin ?? p.earthlyBranch}` : `${p.heavenlyStem} ${p.earthlyBranch}`}
                </span>
                <span className="mt-0.5 block text-xs text-cream/85">{stars.length ? stars.join(" · ") : t.empty}</span>
              </button>
            );
          })}
          <div style={{ gridRow: "2 / span 2", gridColumn: "2 / span 2" }} className="flex flex-col items-center justify-center rounded-xl border border-gold/40 bg-navydeep p-3 text-center">
            <span className="font-display text-2xl font-bold text-goldbright">{en ? zodiacEn(result.zodiac) : result.zodiac}</span>
            <span className="mt-1 text-sm text-cream">{en ? signEn(result.sign) : result.sign}</span>
            <span className="mt-1 text-xs text-mist">
              {t.life}: {life.majorStars.map((s) => primaryStar(s, lang)).join(" · ") || t.empty}
            </span>
          </div>
        </div>
      )}
      {view === "ring" && (
      <motion.div
        {...fade}
        transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
        className="mx-auto mt-4 w-full max-w-[640px] overflow-x-auto"
      >
        <svg viewBox="0 0 720 720" role="img" aria-label={en ? "Ziwei circle chart" : "紫微斗数圆盘"} className="w-full min-w-[480px]">
          <circle cx={RING_CENTRE} cy={RING_CENTRE} r={RING_OUTER + 6} fill="#1a1f2e" stroke="#d4af37" strokeOpacity="0.35" />
          {result.palaces.map((p, i) => {
            const start = sectorStart(i);
            const end = sectorEnd(i);
            const mid = start + 15;
            // Moved inward from the 340 outer edge and shortened: a full
            // "Officer · Treasurer" string at radius 252 overlapped the
            // neighbouring wedge and clipped at the circle edge. The
            // ring now shows only the first major star, plus a count;
            // the detail panel below still lists every star.
            const namePos = polar(RING_CENTRE, RING_CENTRE, 296, mid);
            const stemPos = polar(RING_CENTRE, RING_CENTRE, 276, mid);
            const starPos = polar(RING_CENTRE, RING_CENTRE, 246, mid);
            const allStars = p.majorStars.map((s) => primaryStar(s, lang));
            const stars = allStars.length > 1 ? [allStars[0], `+${allStars.length - 1}`] : allStars;
            const isSel = p.index === selected;
            const isHover = hovered === p.index;
            return (
              <g
                key={p.index}
                role="button"
                tabIndex={0}
                aria-label={`${en ? p.name : p.chineseName}: ${allStars.length ? allStars.join(", ") : t.empty}`}
                aria-pressed={isSel}
                onClick={() => setSelected(p.index)}
                onMouseEnter={() => setHovered(p.index)}
                onMouseLeave={() => setHovered(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(p.index);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <path
                  d={wedgePath(RING_CENTRE, RING_CENTRE, RING_INNER, RING_OUTER, start, end)}
                  fill={isSel ? "#2e2410" : isHover ? "#221d12" : "#1a1f2e"}
                  stroke="#d4af37"
                  strokeOpacity={isSel ? 1 : 0.4}
                  strokeWidth={isSel ? 2 : 1}
                />
                <text x={namePos.x} y={namePos.y} textAnchor="middle" fontSize="15" fontWeight="700" fill={p.isLifePalace ? "#f4d03f" : "#ede6d6"}>
                  {en ? p.name : p.chineseName}
                </text>
                <text x={stemPos.x} y={stemPos.y} textAnchor="middle" fontSize="12" fill="#9ca3af">
                  {en ? `${STEM_PINYIN[p.heavenlyStem] ?? p.heavenlyStem} ${BRANCH_INFO[p.earthlyBranch]?.pinyin ?? p.earthlyBranch}` : `${p.heavenlyStem} ${p.earthlyBranch}`}
                </text>
                <text x={starPos.x} y={starPos.y} textAnchor="middle" fontSize="12" fill="#ede6d6">
                  {stars.length ? stars.join(" · ") : t.empty}
                </text>
                {p.isLifePalace && (
                  <text x={polar(RING_CENTRE, RING_CENTRE, 218, mid).x} y={polar(RING_CENTRE, RING_CENTRE, 218, mid).y} textAnchor="middle" fontSize="11" fill="#f4d03f">
                    ✦
                  </text>
                )}
              </g>
            );
          })}
          <circle cx={RING_CENTRE} cy={RING_CENTRE} r={RING_INNER - 4} fill="#0f1424" stroke="#d4af37" strokeOpacity="0.6" />
          <text x={RING_CENTRE} y={RING_CENTRE - 28} textAnchor="middle" fontSize="30" fontWeight="700" fill="#f4d03f">
            {en ? zodiacEn(result.zodiac) : result.zodiac}
          </text>
          <text x={RING_CENTRE} y={RING_CENTRE + 2} textAnchor="middle" fontSize="16" fill="#ede6d6">
            {en ? signEn(result.sign) : result.sign}
          </text>
          <text x={RING_CENTRE} y={RING_CENTRE + 30} textAnchor="middle" fontSize="13" fill="#9ca3af">
            {en ? `${t.life}: ${life.majorStars.map((s) => primaryStar(s, lang)).join(" · ") || t.empty}` : `${t.life}：${life.majorStars.join(" · ") || t.empty}`}
          </text>
        </svg>
      </motion.div>
      )}

      {/* Mobile palace list: wedge text shrinks with the 720 viewBox on
          phones, so small screens get the same palaces as tappable rows.
          Desktop keeps the ring only; selection state is shared. */}
      {view === "ring" && (
      <div className="mt-4 grid gap-2 sm:hidden" role="list">
        {result.palaces.map((p) => (
          <button
            key={p.index}
            type="button"
            role="listitem"
            onClick={() => setSelected(p.index)}
            aria-pressed={p.index === selected}
            className={`rounded-xl border px-4 py-3 text-left text-sm ${
              p.index === selected ? "border-gold/60 bg-gold/10 text-cream" : "border-gold/25 bg-panel/70 text-cream/85"
            }`}
          >
            <span className="font-semibold text-goldbright">{en ? p.name : p.chineseName}</span>
            {p.isLifePalace && <span className="ml-2 text-xs" aria-hidden="true">✦</span>}
            <span className="mt-0.5 block text-cream/80">
              {p.majorStars.length ? p.majorStars.map((s) => primaryStar(s, lang)).join(" · ") : t.empty}
            </span>
          </button>
        ))}
      </div>
      )}

      <AnimatePresence mode="wait">
        <motion.article
          key={`${current.index}-${lang}`}
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
          className={`mx-auto mt-4 max-w-xl rounded-2xl border p-5 ${current.isLifePalace ? "border-gold/60 bg-gold/10" : "border-gold/25 bg-panel/70"}`}
        >
          <h3 className="font-display text-xl text-goldbright">
            {en ? current.name : current.chineseName}{" "}
            <span className="text-base text-cream/60">({en ? current.chineseName : current.name})</span>
            {/* Life palace needs only the star marker: its name already
                is "Life" (命宫), so adding "Life palace" after it read
                as "Life (命宫) ✦ Life palace". */}
            {current.isLifePalace && <span className="ml-2 text-sm" aria-hidden="true">✦</span>}
          </h3>
          <p className="mt-1 text-sm text-cream/70">
            {en
              ? `${STEM_PINYIN[current.heavenlyStem] ?? current.heavenlyStem} ${BRANCH_INFO[current.earthlyBranch]?.pinyin ?? current.earthlyBranch}`
              : `${current.heavenlyStem} ${current.earthlyBranch}`}{" "}
            <span className="text-cream/60">
              ({en ? `${current.heavenlyStem} ${current.earthlyBranch}` : `${STEM_PINYIN[current.heavenlyStem] ?? current.heavenlyStem} ${BRANCH_INFO[current.earthlyBranch]?.pinyin ?? current.earthlyBranch}`})
            </span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream">
            {current.majorStars.length > 0
              ? current.majorStars
                  .map((s) => {
                    const l = localizeStar(s);
                    return en ? `${l.en} (${l.pinyin} ${l.zh})` : `${l.zh} (${l.en})`;
                  })
                  .join(" · ")
              : t.noMajor}
          </p>
          {current.majorStarsDetail.length > 0 && (
            <p className="mt-1 text-xs text-cream/60">
              {current.majorStarsDetail
                .map((s) => {
                  const l = localizeStar(s.name);
                  const bEn = brightnessEn(s.brightness);
                  const mEn = mutagenEn(s.mutagen);
                  return en
                    ? `${l.en} ${bEn}${mEn ? `, ${mEn}` : ""} (${s.name} ${s.brightness}${s.mutagen})`
                    : `${s.name} ${s.brightness}${s.mutagen} (${l.en} ${bEn}${mEn ? `, ${mEn}` : ""})`;
                })
                .join(" · ")}
            </p>
          )}
          {current.minorStars.length > 0 && (
            <p className="mt-1 text-xs text-cream/60">
              {current.minorStars
                .map((s) => {
                  const l = localizeMinorStar(s);
                  return en ? `${l.pinyin} (${l.zh})` : `${l.zh} (${l.pinyin})`;
                })
                .join(" · ")}
            </p>
          )}
        </motion.article>
      </AnimatePresence>
      <p className="mt-4 text-sm text-cream/60">{t.note}</p>
    </div>
  );
}
