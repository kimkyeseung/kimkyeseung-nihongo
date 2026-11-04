// 한자 숫자 + 단위의 읽기. 사전에는 「四時」「六百年」 같은 조합이 없어서, 글자별로 쪼개면 四(し)+時(とき)가
// 된다(레벨 진단에서 실제로 보고받았다). 정해진 규칙이라 코드로 계산한다 — LLM에게 묻지 않는다.
//
// 표에 없는 단위는 null이다. 틀린 읽기를 다느니 안 다는 쪽이 낫다.

const DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const DIGIT_READING = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const HUNDREDS: Record<number, string> = { 1: "ひゃく", 3: "さんびゃく", 6: "ろっぴゃく", 8: "はっぴゃく" };
const THOUSANDS: Record<number, string> = { 1: "せん", 3: "さんぜん", 8: "はっせん" };

export const NUMERAL = /^[一二三四五六七八九十百千]+/;

/** 「三十五」 → 35. 숫자 모양이 아니면(「十百」) null. 9999까지만 다룬다. */
export function parseKanjiNumber(text: string): number | null {
  let total = 0;
  let digit = 0;
  let lastUnit = Infinity;
  for (const ch of text) {
    if (ch in DIGITS) {
      if (digit !== 0) return null; // 「二三」처럼 자릿값 없이 이어진 숫자
      digit = DIGITS[ch];
    } else {
      const unit = UNITS[ch];
      if (!unit || unit >= lastUnit) return null;
      total += (digit || 1) * unit;
      digit = 0;
      lastUnit = unit;
    }
  }
  return total + digit;
}

/** 일의 자리 앞까지의 읽기(「三百二十」 → さんびゃくにじゅう). */
function tensAndUp(n: number): string {
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor(n / 100) % 10;
  const tens = Math.floor(n / 10) % 10;
  let out = "";
  if (thousands) out += THOUSANDS[thousands] ?? `${DIGIT_READING[thousands]}せん`;
  if (hundreds) out += HUNDREDS[hundreds] ?? `${DIGIT_READING[hundreds]}ひゃく`;
  if (tens) out += `${tens === 1 ? "" : DIGIT_READING[tens]}じゅう`;
  return out;
}

export function readNumber(n: number): string {
  return tensAndUp(n) + DIGIT_READING[n % 10];
}

type CounterRule = {
  /** 기본 읽기. */
  base: string;
  /** 일의 자리별로 달라지는 숫자+단위 전체(「3 → さんがい」). */
  ones?: Record<number, string>;
  /** 10의 배수로 끝날 때의 끝 읽기(「十冊 → じゅっさつ」). */
  tens?: string;
};

/** 촉음이 되는 단위(いっさつ·はっさつ·じゅっさつ). */
const sokuon = (base: string): CounterRule => ({
  base,
  ones: { 1: `いっ${base}`, 8: `はっ${base}` },
  tens: `じゅっ${base}`,
});

const COUNTERS: Record<string, CounterRule> = {
  時間: { base: "じかん", ones: { 4: "よじかん", 7: "しちじかん", 9: "くじかん" } },
  時: { base: "じ", ones: { 4: "よじ", 7: "しちじ", 9: "くじ" } },
  人: { base: "にん", ones: { 4: "よにん", 7: "しちにん" } },
  年: { base: "ねん", ones: { 4: "よねん", 7: "しちねん" } },
  円: { base: "えん", ones: { 4: "よえん" } },
  番: { base: "ばん" },
  歳: sokuon("さい"),
  冊: sokuon("さつ"),
  階: {
    base: "かい",
    ones: { 1: "いっかい", 3: "さんがい", 6: "ろっかい", 8: "はっかい" },
    tens: "じゅっかい",
  },
  分: {
    base: "ふん",
    ones: { 1: "いっぷん", 3: "さんぷん", 4: "よんぷん", 6: "ろっぷん", 8: "はっぷん" },
    tens: "じゅっぷん",
  },
};

const MONTH_ONES: Record<number, string> = { 4: "しがつ", 7: "しちがつ", 9: "くがつ" };
const DATE_SPECIAL: Record<number, string> = {
  1: "ついたち",
  2: "ふつか",
  3: "みっか",
  4: "よっか",
  5: "いつか",
  6: "むいか",
  7: "なのか",
  8: "ようか",
  9: "ここのか",
  10: "とおか",
  14: "じゅうよっか",
  20: "はつか",
  24: "にじゅうよっか",
};
const DATE_ONES: Record<number, string> = { 7: "しちにち", 9: "くにち" };

function readWithCounter(n: number, counter: string): string | null {
  if (counter === "月") {
    if (n < 1 || n > 12) return null;
    return n % 10 in MONTH_ONES && n < 10 ? MONTH_ONES[n] : `${readNumber(n)}がつ`;
  }
  if (counter === "日") {
    if (n < 1 || n > 31) return null;
    if (DATE_SPECIAL[n]) return DATE_SPECIAL[n];
    const ones = n % 10;
    return `${tensAndUp(n)}${DATE_ONES[ones] ?? `${DIGIT_READING[ones]}にち`}`;
  }
  const rule = COUNTERS[counter];
  if (!rule) return null;
  const ones = n % 10;
  if (ones === 0) {
    if (!rule.tens || n % 100 === 0) return `${readNumber(n)}${rule.base}`;
    // 十의 자리가 단위와 붙어 촉음이 된다(二十冊 → にじゅっさつ). 그 위 자리는 그대로 읽는다.
    const tens = Math.floor(n / 10) % 10;
    return tensAndUp(n - tens * 10) + (tens === 1 ? "" : DIGIT_READING[tens]) + rule.tens;
  }
  return `${tensAndUp(n)}${rule.ones?.[ones] ?? `${DIGIT_READING[ones]}${rule.base}`}`;
}

/** 단위 이름(긴 것부터 본다 — 「時間」을 「時」로 먼저 자르지 않게). */
const COUNTER_NAMES = ["時間", "時", "人", "年", "円", "番", "歳", "冊", "階", "分", "月", "日"];

/**
 * 글 맨 앞의 숫자(+단위)를 읽는다. 「四時に」 → { text: "四時", reading: "よじ", hasCounter: true }.
 * 숫자로 시작하지 않거나 숫자 모양이 아니면 null.
 */
export function readNumberPrefix(text: string): { text: string; reading: string; hasCounter: boolean } | null {
  const numeral = NUMERAL.exec(text)?.[0];
  if (!numeral) return null;
  const n = parseKanjiNumber(numeral);
  if (n === null) return null;

  const rest = text.slice(numeral.length);
  for (const counter of COUNTER_NAMES) {
    if (!rest.startsWith(counter)) continue;
    const reading = readWithCounter(n, counter);
    return reading ? { text: numeral + counter, reading, hasCounter: true } : null;
  }
  return { text: numeral, reading: readNumber(n), hasCounter: false };
}
