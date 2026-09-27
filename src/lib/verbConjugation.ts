import type { WordEntry } from "../types/dictionary";

export type VerbGroup = "ichidan" | "godan" | "suru" | "kuru";
export type AdjectiveType = "i" | "na";

/** 보여주고 연습시키는 활용형. 순서가 곧 화면(활용표)의 순서다. */
export type VerbForm = "masu" | "nai" | "ta" | "te" | "potential" | "volitional";

export const VERB_FORMS: readonly VerbForm[] = ["masu", "nai", "ta", "te", "potential", "volitional"];

export const VERB_FORM_LABEL: Record<VerbForm, { name: string; hint: string }> = {
  masu: { name: "ます형", hint: "정중하게" },
  nai: { name: "ない형", hint: "~하지 않다" },
  ta: { name: "た형", hint: "~했다" },
  te: { name: "て형", hint: "~하고, ~해서" },
  potential: { name: "가능형", hint: "~할 수 있다" },
  volitional: { name: "의지형", hint: "~하자" },
};

export type VerbConjugation = { form: VerbForm; kanji: string; reading: string | null };

const ICHIDAN_POS = new Set(["v1", "v1-s"]);
// `vs-c`(為 す 같은 문어형)는 뺀다 — する 규칙을 적용하면 「為して」 같은 없는 말이 나온다.
const SURU_POS = new Set(["vs", "vs-i", "vs-s"]);
const I_ADJ_POS = new Set(["adj-i", "adj-ix", "adj-ku", "adj-shiku"]);
const NA_ADJ_POS = new Set(["adj-na", "adj-nari"]);

/**
 * 사전 품사 코드로 동사 그룹을 판별한다. `v2*`·`v4*`(고어 2단·4단)는 현대어 규칙이 안 맞아
 * null이다 — 틀린 활용을 보여주느니 안 보여준다.
 *
 * `vz`(信ずる류)는 1단으로 친다 — ずる가 じる로 바뀐 뒤(信じる) 1단 규칙을 따른다. 예전엔 る만
 * 떼고 て를 붙여 「信ずて」라는 없는 말을 보여줬다.
 */
function detectVerbGroup(pos: string[]): VerbGroup | null {
  if (pos.includes("vk")) return "kuru";
  if (pos.some((p) => SURU_POS.has(p))) return "suru";
  if (pos.includes("vz") || pos.some((p) => ICHIDAN_POS.has(p))) return "ichidan";
  if (pos.some((p) => p.startsWith("v5"))) return "godan";
  return null;
}

/** 사전의 품사 코드로 い형용사/な형용사 여부를 판별한다 (LLM이 아니라 정적 데이터 기반). */
export function detectAdjectiveType(entry: WordEntry): AdjectiveType | null {
  if (entry.pos.some((p) => I_ADJ_POS.has(p))) return "i";
  if (entry.pos.some((p) => NA_ADJ_POS.has(p))) return "na";
  return null;
}

// 五段 어미를 다른 단(段)으로 옮기는 표. う행의 あ단은 あ가 아니라 わ다(買う → 買わない).
const GODAN_ROWS: Record<string, { a: string; i: string; e: string; o: string }> = {
  う: { a: "わ", i: "い", e: "え", o: "お" },
  く: { a: "か", i: "き", e: "け", o: "こ" },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご" },
  す: { a: "さ", i: "し", e: "せ", o: "そ" },
  つ: { a: "た", i: "ち", e: "て", o: "と" },
  ぬ: { a: "な", i: "に", e: "ね", o: "の" },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ" },
  む: { a: "ま", i: "み", e: "め", o: "も" },
  る: { a: "ら", i: "り", e: "れ", o: "ろ" },
};

// 五段 동사의 어미별 て형 접미사(た형은 て→た, で→だ).
const GODAN_TE_SUFFIX: Record<string, string> = {
  う: "って",
  つ: "って",
  る: "って",
  く: "いて",
  ぐ: "いで",
  す: "して",
  ぬ: "んで",
  ぶ: "んで",
  む: "んで",
};

function toTa(te: string): string {
  return te.endsWith("で") ? `${te.slice(0, -1)}だ` : `${te.slice(0, -1)}た`;
}

function godanForm(base: string, pos: string[], form: VerbForm): string | null {
  const last = base.slice(-1);
  const stem = base.slice(0, -1);
  const row = GODAN_ROWS[last];
  if (!row) return null;

  const te = (() => {
    // 行く/逝く(v5k-s)는 く 어미라도 いて가 아니라 って가 된다.
    if (last === "く" && pos.includes("v5k-s")) return `${stem}って`;
    // 問う/請う(v5u-s)는 って가 아니라 うて가 된다(問うて·問うた).
    if (last === "う" && pos.includes("v5u-s")) return `${base}て`;
    return stem + GODAN_TE_SUFFIX[last];
  })();

  switch (form) {
    case "masu":
      // なさる·くださる·おっしゃる(v5aru)는 り가 아니라 い가 된다(なさいます).
      return pos.includes("v5aru") ? `${stem}います` : `${stem}${row.i}ます`;
    case "nai":
      // ある(v5r-i)의 부정은 「あらない」가 아니라 「ない」다. 한자 표기(有る)도 ない로 쓴다.
      return pos.includes("v5r-i") ? "ない" : `${stem}${row.a}ない`;
    case "te":
      return te;
    case "ta":
      return toTa(te);
    case "potential":
      return `${stem}${row.e}る`;
    case "volitional":
      return `${stem}${row.o}う`;
  }
}

function ichidanForm(base: string, pos: string[], form: VerbForm): string | null {
  if (!base.endsWith("る")) return null;
  // 信ずる → 信じ(る): ずる 동사는 じる 동사와 같은 활용을 한다.
  const stem = pos.includes("vz") && base.endsWith("ずる") ? `${base.slice(0, -2)}じ` : base.slice(0, -1);
  switch (form) {
    case "masu":
      return `${stem}ます`;
    case "nai":
      return `${stem}ない`;
    case "ta":
      return `${stem}た`;
    case "te":
      return `${stem}て`;
    case "potential":
      return `${stem}られる`;
    case "volitional":
      return `${stem}よう`;
  }
}

function suruForm(base: string, pos: string[], form: VerbForm): string | null {
  // "察する"처럼 표제어 자체가 する(한자로 為る)로 끝나는 경우와, "勉強"처럼 する가 붙지 않은
  // 명사(vs 태그)인 경우 둘 다 있어서 먼저 확인한다.
  const stem = base.endsWith("する") || base.endsWith("為る") ? base.slice(0, -2) : base;
  // 察する·愛する(vs-s)는 ない·가능·의지형이 5단처럼 갈린다(愛さない·愛せる). 규칙이 단어마다
  // 달라 틀릴 바에는 보여주지 않는다 — ます·た·て형은 する와 같아서 그대로 쓴다.
  const irregularStem = pos.includes("vs-s");
  switch (form) {
    case "masu":
      return `${stem}します`;
    case "ta":
      return `${stem}した`;
    case "te":
      return `${stem}して`;
    case "nai":
      return irregularStem ? null : `${stem}しない`;
    case "potential":
      // 勉強する → 勉強できる. する 자체의 가능형도 できる다.
      return irregularStem ? null : `${stem}できる`;
    case "volitional":
      return irregularStem ? null : `${stem}しよう`;
  }
}

/**
 * 来る는 어간의 읽기가 활용형마다 바뀐다(き·こ). 한자로 쓰면 来 한 글자가 그 소리를 다 떠안으므로
 * 표기는 来 그대로 두고 읽기만 바꾼다.
 */
function kuruForm(base: string, form: VerbForm): string | null {
  const kanji = base.endsWith("来る");
  if (!kanji && !base.endsWith("くる")) return null;
  const prefix = base.slice(0, -2);
  const sound = form === "nai" || form === "potential" || form === "volitional" ? "こ" : "き";
  const head = prefix + (kanji ? "来" : sound);
  switch (form) {
    case "masu":
      return `${head}ます`;
    case "nai":
      return `${head}ない`;
    case "ta":
      return `${head}た`;
    case "te":
      return `${head}て`;
    case "potential":
      return `${head}られる`;
    case "volitional":
      return `${head}よう`;
  }
}

// word(한자 표기)와 reading(히라가나)에 똑같이 적용한다 — 동사는 항상 마지막 글자가
// 두 표기 모두에서 같은 가나이므로(오쿠리가나 규칙), 어미 기반 규칙이 그대로 통한다.
// (来る만 예외라 kuruForm이 따로 다룬다.)
function conjugate(base: string, group: VerbGroup, pos: string[], form: VerbForm): string | null {
  switch (group) {
    case "ichidan":
      return ichidanForm(base, pos, form);
    case "godan":
      return godanForm(base, pos, form);
    case "suru":
      return suruForm(base, pos, form);
    case "kuru":
      return kuruForm(base, form);
  }
}

/**
 * 동사의 활용형 하나를 규칙으로 계산한다(LLM 미사용 — 프로젝트 규칙). 동사가 아니거나, 이
 * 단어에 그 규칙이 안 맞으면(고어·불규칙) null. 읽기가 표기와 같으면(가나뿐인 표제어)
 * reading은 null로 둬서 중복 표시를 피한다.
 */
export function conjugateVerb(entry: WordEntry, form: VerbForm): VerbConjugation | null {
  const group = detectVerbGroup(entry.pos);
  if (!group) return null;
  const kanji = conjugate(entry.word, group, entry.pos, form);
  const reading = conjugate(entry.reading, group, entry.pos, form);
  if (!kanji || !reading) return null;
  return { form, kanji, reading: reading === kanji ? null : reading };
}

/** 활용표 — 계산되는 활용형만. 동사가 아니면 null. */
export function getVerbConjugations(entry: WordEntry): VerbConjugation[] | null {
  if (!detectVerbGroup(entry.pos)) return null;
  const rows = VERB_FORMS.map((form) => conjugateVerb(entry, form)).filter(
    (row): row is VerbConjugation => row !== null
  );
  return rows.length > 0 ? rows : null;
}

/**
 * 동사의 사전형(기본형). **する 명사(勉強·vs)는 する를 붙여 보여준다** — 활용 연습에
 * 「勉強 → 의지형」이라고 내면 명사를 활용하라는 것처럼 읽힌다.
 */
export function dictionaryForm(entry: WordEntry): { kanji: string; reading: string } {
  const needsSuru = detectVerbGroup(entry.pos) === "suru" && !/(する|為る)$/.test(entry.word);
  return needsSuru
    ? { kanji: `${entry.word}する`, reading: `${entry.reading}する` }
    : { kanji: entry.word, reading: entry.reading };
}
