// Ziwei two-language display data. Pure data, no Node imports, so it is
// safe to import from client components and from the Node test script.
// The calculation API still returns raw Chinese values; language is a
// display concern, applied here and in ZiweiChartBoard only.
// Star archetype names are standard archetypes, not iztro's literal
// translations and not school terms: schools differ on some names.
export type ZiweiLanguage = "en" | "zh";

export interface LocalizedStar {
  zh: string;
  pinyin: string;
  en: string;
}

const MAJOR_STARS: Record<string, { pinyin: string; en: string }> = {
  "紫微": { pinyin: "Zi Wei", en: "Emperor" },
  "天机": { pinyin: "Tian Ji", en: "Strategist" },
  "太阳": { pinyin: "Tai Yang", en: "Sun" },
  "武曲": { pinyin: "Wu Qu", en: "Financier" },
  "天同": { pinyin: "Tian Tong", en: "Joymaker" },
  "廉贞": { pinyin: "Lian Zhen", en: "Officer" },
  "天府": { pinyin: "Tian Fu", en: "Treasurer" },
  "太阴": { pinyin: "Tai Yin", en: "Moon" },
  "贪狼": { pinyin: "Tan Lang", en: "Desire" },
  "巨门": { pinyin: "Ju Men", en: "Gate" },
  "天相": { pinyin: "Tian Xiang", en: "Minister" },
  "天梁": { pinyin: "Tian Liang", en: "Blessing" },
  "七杀": { pinyin: "Qi Sha", en: "General" },
  "破军": { pinyin: "Po Jun", en: "Reformer" },
};

export function localizeStar(name: string): LocalizedStar {
  const hit = MAJOR_STARS[name];
  return hit ? { zh: name, pinyin: hit.pinyin, en: hit.en } : { zh: name, pinyin: name, en: name };
}

// Minor stars: only the values actually seen in iztro output for the test
// examples are transliterated here. Unknown minor stars fall back to their
// Chinese name, so no meaning is invented for a value not seen.
const MINOR_PINYIN: Record<string, string> = {
  "铃星": "Ling Xing",
  "左辅": "Zuo Fu",
  "地劫": "Di Jie",
  "陀罗": "Tuo Luo",
  "文昌": "Wen Chang",
  "禄存": "Lu Cun",
  "地空": "Di Kong",
  "火星": "Huo Xing",
  "擎羊": "Qing Yang",
  "文曲": "Wen Qu",
  "天钺": "Tian Yue",
  "右弼": "You Bi",
  "天马": "Tian Ma",
  "天魁": "Tian Kui",
};

export function localizeMinorStar(name: string): { zh: string; pinyin: string } {
  return { zh: name, pinyin: MINOR_PINYIN[name] ?? name };
}

export const STEM_PINYIN: Record<string, string> = {
  "甲": "Jia", "乙": "Yi", "丙": "Bing", "丁": "Ding", "戊": "Wu",
  "己": "Ji", "庚": "Geng", "辛": "Xin", "壬": "Ren", "癸": "Gui",
};

export const BRANCH_INFO: Record<string, { pinyin: string; animal: string; hours: string }> = {
  "子": { pinyin: "Zi", animal: "Rat", hours: "23:00-01:00" },
  "丑": { pinyin: "Chou", animal: "Ox", hours: "01:00-03:00" },
  "寅": { pinyin: "Yin", animal: "Tiger", hours: "03:00-05:00" },
  "卯": { pinyin: "Mao", animal: "Rabbit", hours: "05:00-07:00" },
  "辰": { pinyin: "Chen", animal: "Dragon", hours: "07:00-09:00" },
  "巳": { pinyin: "Si", animal: "Snake", hours: "09:00-11:00" },
  "午": { pinyin: "Wu", animal: "Horse", hours: "11:00-13:00" },
  "未": { pinyin: "Wei", animal: "Goat", hours: "13:00-15:00" },
  "申": { pinyin: "Shen", animal: "Monkey", hours: "15:00-17:00" },
  "酉": { pinyin: "You", animal: "Rooster", hours: "17:00-19:00" },
  "戌": { pinyin: "Xu", animal: "Dog", hours: "19:00-21:00" },
  "亥": { pinyin: "Hai", animal: "Pig", hours: "21:00-23:00" },
};

const ZODIAC_EN: Record<string, string> = {
  "鼠": "Rat", "牛": "Ox", "虎": "Tiger", "兔": "Rabbit", "龙": "Dragon", "蛇": "Snake",
  "马": "Horse", "羊": "Goat", "猴": "Monkey", "鸡": "Rooster", "狗": "Dog", "猪": "Pig",
};

export function zodiacEn(zodiac: string): string {
  return ZODIAC_EN[zodiac] ?? zodiac;
}

const SIGN_EN: Record<string, string> = {
  "白羊座": "Aries", "金牛座": "Taurus", "双子座": "Gemini", "巨蟹座": "Cancer",
  "狮子座": "Leo", "处女座": "Virgo", "天秤座": "Libra", "天蝎座": "Scorpio",
  "射手座": "Sagittarius", "摩羯座": "Capricorn", "水瓶座": "Aquarius", "双鱼座": "Pisces",
};

export function signEn(sign: string): string {
  return SIGN_EN[sign] ?? sign;
}

// iztro's 7 brightness levels, as actually returned. 不 is its lowest
// level; no canonical English name is in iztro docs, so Dim is a
// descriptive label here, not a school term.
export const BRIGHTNESS_EN: Record<string, string> = {
  "庙": "Temple", "旺": "Prosperous", "得": "Favourable", "利": "Advantageous",
  "平": "Neutral", "陷": "Fallen", "不": "Dim",
};

export function brightnessEn(brightness: string): string {
  return BRIGHTNESS_EN[brightness] ?? brightness;
}

// Si Hua (four transformations), standard names.
export const MUTAGEN_EN: Record<string, string> = {
  "禄": "Prosperity", "权": "Authority", "科": "Recognition", "忌": "Challenge",
};

export function mutagenEn(mutagen: string): string {
  if (!mutagen) return "";
  return MUTAGEN_EN[mutagen] ?? mutagen;
}

const DIGIT: Record<string, string> = {
  "〇": "0", "一": "1", "二": "2", "三": "3", "四": "4",
  "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
};

function parseLunarDay(day: string): number | null {
  if (day.startsWith("初")) {
    const d = DIGIT[day.slice(1)];
    return d ? Number(d) : null;
  }
  if (day === "三十") return 30;
  if (day.startsWith("廿")) {
    const d = DIGIT[day.slice(1)];
    return d ? 20 + Number(d) : null;
  }
  if (day.startsWith("十")) {
    if (day.length === 1) return 10;
    const d = DIGIT[day.slice(1)];
    return d ? 10 + Number(d) : null;
  }
  return null;
}

function parseLunarMonth(month: string): number | null {
  if (month === "正") return 1;
  if (month === "腊") return 12;
  if (month === "冬") return 11;
  if (month === "十") return 10;
  if (month === "十一") return 11;
  if (month === "十二") return 12;
  const d = DIGIT[month];
  return d ? Number(d) : null;
}

// e.g. 一九八九年腊月初五 -> "Lunar year 1989, month 12, day 5".
// Returns null when the input does not parse, so callers fall back to raw.
export function formatLunarDateEn(lunarDate: string): string | null {
  const yearEnd = lunarDate.indexOf("年");
  const monthEnd = lunarDate.indexOf("月");
  if (yearEnd < 0 || monthEnd < 0 || monthEnd <= yearEnd) return null;
  const yearChars = lunarDate.slice(0, yearEnd).split("");
  if (!yearChars.every((c) => DIGIT[c] !== undefined)) return null;
  const year = Number(yearChars.map((c) => DIGIT[c]).join(""));
  const month = parseLunarMonth(lunarDate.slice(yearEnd + 1, monthEnd));
  const day = parseLunarDay(lunarDate.slice(monthEnd + 1));
  if (!month || !day) return null;
  return `Lunar year ${year}, month ${month}, day ${day}`;
}

// e.g. 己巳 丁丑 丙寅 壬辰 -> "Ji-Si, Ding-Chou, Bing-Yin, Ren-Chen".
export function formatChineseDateEn(chineseDate: string): string {
  return chineseDate
    .split(" ")
    .map((pair) => {
      if (pair.length !== 2) return pair;
      const stem = STEM_PINYIN[pair[0]] ?? pair[0];
      const branch = BRANCH_INFO[pair[1]]?.pinyin ?? pair[1];
      return `${stem}-${branch}`;
    })
    .join(", ");
}

// e.g. 辰时 -> "Chen hour (07:00-09:00)".
export function formatTimeLabelEn(timeLabel: string): string {
  const branch = timeLabel.replace("时", "");
  const info = BRANCH_INFO[branch];
  if (!info) return timeLabel;
  return `${info.pinyin} hour (${info.hours})`;
}
