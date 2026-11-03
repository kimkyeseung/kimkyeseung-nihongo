// 선생님 질문에 든 일본어를 **앱의 사전·활용 규칙·커리큘럼으로 미리 풀어** 질문 옆에 붙인다.
//
// 2B 온디바이스 모델이 가장 자주 틀리는 건 설명이 아니라 사실이다 — 「面白い」에 おもろい를 붙이고,
// 활용형을 지어내고, 뜻을 헷갈린다. 사실은 앱이 이미 들고 있으니(dictionary.json·verbConjugation·
// grammarPatterns) 모델은 설명만 하면 되게 만든다. "사전적 사실은 LLM이 지어내지 않는다"는 규칙 그대로다.
//
// **사전(7.7MB)을 정적으로 끌어오는 모듈이라 TeacherSessionController가 동적 import로만 쓴다**
// (컨트롤러는 Layout에 상주한다 — 정적으로 넣으면 모든 페이지 진입 청크에 사전이 딸려 온다).
//
// **틀린 참고는 없는 참고보다 나쁘다.** 모델은 "앱 사전"이라고 적힌 줄을 믿는다. 그래서:
// - 그리디 분절(sentenceWords)은 활용형을 모른다 — 「読みました」가 名詞 読み로, 「降って」가 降 한 글자로
//   잡힌다. 여기서는 **활용 어미를 떼어 사전형으로 되돌려 보고**(`deinflect`), 품사가 그 활용에 맞는
//   동사·형용사일 때만 채택한다. 분절보다 길게 잡힐 때만 이긴다.
// - **가나로만 된 두 글자 이하 낱말은 뺀다.** 「わたし」의 わた가 綿(목화)로 잡혔다 — 그런 줄이 들어가면
//   모델이 "목화"를 설명한다. 조사·조동사도 뺀다(앱이 줄 정보가 거의 없고 줄만 길어진다).
// - 사전에 없는 건 적지 않는다. 지어낸 줄이 하나도 없어야 "이 정보를 따르라"고 말할 수 있다.
//
// 블록에 들어가는 글자는 **사전·한자·커리큘럼 데이터**다 — 표제어도 문장 속 글자가 아니라 사전 표기로
// 적는다. 예외는 "문장 속 「読みました」" 하나인데, 사전형으로 되돌려진 동사·형용사 한 낱말(12자 이하)이라
// 지시문이 될 수 없다. 그래서 학습자 구분자 블록 밖에 둘 수 있다.

import type { Curriculum } from "../types/curriculum";
import type { WordEntry } from "../types/dictionary";
import { findGrammarInSentence } from "./grammarPatterns";
import { getKanjiEntry } from "./kanji";
import { translatePos } from "./posTags";
import { lookupWord, segmentSentenceIntoWords } from "./sentenceWords";
import { VERB_FORM_LABEL, conjugateVerb, type VerbForm } from "./verbConjugation";

/** 일본어로 이어진 구간(가나·한자·장음·반복 부호·일본어 문장부호). */
const JAPANESE_RUN = /[぀-ヿ㐀-鿿々〆ー、。！？「」『』・〜～]+/g;
const KANJI = /[㐀-鿿々]/;
const HAS_KANA_OR_KANJI = /[぀-ヿ㐀-鿿]/;

/** 앱이 줄 정보가 거의 없는 품사(조사·조동사·계사·접속사) — 이것뿐인 항목은 싣지 않는다. */
const FUNCTION_POS = new Set(["prt", "aux", "aux-v", "aux-adj", "cop", "cop-da", "conj"]);

/** 붙이는 분량의 상한. 온디바이스라 돈은 안 들지만 창(8192)과 첫 글자까지의 시간을 먹는다. */
export const GROUNDING_MAX_WORDS = 8;
export const GROUNDING_MAX_GRAMMAR = 3;
/** 다룰 일본어 글자 수의 상한 — 긴 지문을 붙여 넣어도 앞부분만 본다. */
const GROUNDING_MAX_TEXT = 200;

/** 활용표에 싣는 형태. 가능·의지형까지 넣으면 한 줄이 두 배가 된다 — 자주 묻는 넷만. */
const TABLE_FORMS: readonly VerbForm[] = ["masu", "nai", "ta", "te"];

/**
 * `godan-onbin`은 て·た형의 음편(っ·い·ん) 규칙 — 行く(`v5k-s`)는 거기서만 다르게 굴어(行って) 따로 뺀다.
 * 다른 5단 규칙(行きます·行かない)에서는 行く도 그냥 5단이다.
 */
type Group = "ichidan" | "godan" | "godan-onbin" | "iku" | "suru" | "kuru" | "adj-i";
type Rule = { suffix: string; base: string; group: Group };

const GODAN_ROWS: readonly { u: string; i: string; a: string; e: string; o: string }[] = [
  { u: "う", i: "い", a: "わ", e: "え", o: "お" },
  { u: "く", i: "き", a: "か", e: "け", o: "こ" },
  { u: "ぐ", i: "ぎ", a: "が", e: "げ", o: "ご" },
  { u: "す", i: "し", a: "さ", e: "せ", o: "そ" },
  { u: "つ", i: "ち", a: "た", e: "て", o: "と" },
  { u: "ぬ", i: "に", a: "な", e: "ね", o: "の" },
  { u: "ぶ", i: "び", a: "ば", e: "べ", o: "ぼ" },
  { u: "む", i: "み", a: "ま", e: "め", o: "も" },
  { u: "る", i: "り", a: "ら", e: "れ", o: "ろ" },
];

const MASU_TAILS = ["ます", "ました", "ません", "ませんでした", "ましょう", "たい", "たかった", "たくない", "ながら"];
const NAI_TAILS = ["ない", "なかった", "なくて", "ないで", "れる", "れた", "れない", "せる", "せた"];

/** 활용 어미 → 사전형. 어느 동사에 맞는지는 `group`으로 사전 품사와 대조한다. */
const RULES: readonly Rule[] = (() => {
  const rules: Rule[] = [];
  for (const tail of [...MASU_TAILS, ...NAI_TAILS, "た", "て", "ている", "ていた", "てください", "られる", "られた", "させる", "よう", "れば", "ろ"]) {
    rules.push({ suffix: tail, base: "る", group: "ichidan" });
  }
  for (const row of GODAN_ROWS) {
    for (const tail of MASU_TAILS) rules.push({ suffix: row.i + tail, base: row.u, group: "godan" });
    for (const tail of NAI_TAILS) rules.push({ suffix: row.a + tail, base: row.u, group: "godan" });
    for (const tail of ["る", "ます", "ない", "ば", "た"]) rules.push({ suffix: row.e + tail, base: row.u, group: "godan" });
    rules.push({ suffix: row.o + "う", base: row.u, group: "godan" });
  }
  // て·た형의 음편.
  for (const [stem, bases] of [
    ["っ", ["う", "つ", "る"]],
    ["い", ["く"]],
    ["い", ["ぐ"]],
    ["し", ["す"]],
    ["ん", ["ぬ", "ぶ", "む"]],
  ] as const) {
    const voiced = bases.some((b) => ["ぐ", "ぬ", "ぶ", "む"].includes(b));
    for (const tail of voiced ? ["で", "だ", "でいる", "でください"] : ["て", "た", "ている", "てください"]) {
      for (const base of bases) rules.push({ suffix: stem + tail, base, group: "godan-onbin" });
    }
  }
  for (const tail of ["て", "た", "ている", "てください"]) rules.push({ suffix: "っ" + tail, base: "く", group: "iku" });
  for (const tail of ["する", "します", "しました", "しません", "して", "した", "しない", "しなかった", "しよう", "している", "してください", "できる", "できます"]) {
    rules.push({ suffix: tail, base: "", group: "suru" });
  }
  for (const tail of ["て", "た", "ます", "ました", "ない", "なかった", "よう", "ている", "てください"]) {
    rules.push({ suffix: tail, base: "る", group: "kuru" });
  }
  for (const tail of ["かった", "くない", "くなかった", "くて", "く", "ければ", "さ"]) {
    rules.push({ suffix: tail, base: "い", group: "adj-i" });
  }
  // 긴 어미부터 — 「ませんでした」를 「た」로 먼저 떼지 않게.
  return rules.sort((a, b) => b.suffix.length - a.suffix.length);
})();

function fitsGroup(entry: WordEntry, group: Group): boolean {
  const pos = entry.pos;
  switch (group) {
    case "ichidan":
      return pos.some((p) => p === "v1" || p === "v1-s" || p === "vz");
    case "godan":
      return pos.some((p) => p.startsWith("v5"));
    case "godan-onbin":
      return pos.some((p) => p.startsWith("v5") && p !== "v5k-s");
    case "iku":
      return pos.includes("v5k-s");
    case "suru":
      return pos.some((p) => p === "vs" || p === "vs-i" || p === "vs-s");
    case "kuru":
      return pos.includes("vk");
    case "adj-i":
      return pos.some((p) => p === "adj-i" || p === "adj-ix");
  }
}

const LEVEL_RANK: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/** 같은 표기의 후보 중 흔한 것 → 낮은 급수 → 급수 있는 것. 가나 표기(なる)는 후보가 여럿이다. */
function rank(entry: WordEntry): number {
  return (entry.common ? 0 : 10) + (entry.jlptLevel ? LEVEL_RANK[entry.jlptLevel] : 5);
}

/**
 * 이 글자가 활용형이면 사전형 항목. 「読みました」 → 読む, 「降って」 → 降る, 「勉強して」 → 勉強.
 * 사전형 자체(어미가 없음)는 여기가 아니라 분절에서 잡힌다.
 *
 * 맞는 규칙이 여럿이면 **어미를 덜 뗀 쪽(사전형이 긴 쪽)**을 쓴다 — 「抜けない」를 가능형 부정으로 읽어
 * 抜く로 되돌리면 안 되고 1단 抜ける여야 한다. 같은 길이면 行く(行った)를 먼저 — 「行った」를 行う로
 * 되돌렸다(커리큘럼 예문 전수로 확인).
 */
export function deinflect(text: string): WordEntry | null {
  let best: { entry: WordEntry; lemmaLength: number; priority: number } | null = null;
  const kanaOnly = !KANJI.test(text);
  for (const rule of RULES) {
    if (!text.endsWith(rule.suffix)) continue;
    const stem = text.slice(0, text.length - rule.suffix.length);
    if (!stem) continue;
    // 来る는 표기가 来 하나라 어간이 来일 때만, する 명사는 어간이 한자를 담을 때만 본다
    // (가나 어간에 する 규칙을 걸면 「しました」 앞의 아무 가나나 명사로 잡힌다).
    if (rule.group === "kuru" && stem !== "来" && stem !== "く" && stem !== "こ" && stem !== "き") continue;
    if (rule.group === "suru" && !KANJI.test(stem)) continue;
    const lemma = rule.group === "kuru" ? "来る" : stem + rule.base;
    const candidates = lookupWord(lemma).filter((e) => fitsGroup(e, rule.group));
    if (candidates.length === 0) continue;
    const entry = [...candidates].sort((a, b) => rank(a) - rank(b))[0];
    // 가나뿐인 활용형의 어간이 한 글자면 **흔한 N5 동사일 때만** 받는다 — 「ついた」가 吐く로, 「させます」가
    // 注す로 잡혔다. いる·ある·なる(います·ありません·なりました)는 살린다.
    if (kanaOnly && rule.group !== "kuru" && stem.length < 2 && !(entry.common && entry.jlptLevel === "N5")) continue;
    const priority = rule.group === "iku" ? 1 : 0;
    const lemmaLength = rule.group === "kuru" ? text.length - rule.suffix.length + 1 : lemma.length;
    if (!best || lemmaLength > best.lemmaLength || (lemmaLength === best.lemmaLength && priority > best.priority)) {
      best = { entry, lemmaLength, priority };
    }
  }
  return best?.entry ?? null;
}

type Found = { entry: WordEntry; text: string };

/**
 * 일본어 구간을 낱말로 나눈다. 자리마다 "활용형을 되돌려 찾은 것"과 "분절이 잡은 것" 중 **긴 쪽**을 쓴다.
 * 반환은 실을 만한 낱말과, 낱말로 못 잡은 한자 글자.
 */
export function findGroundingWords(run: string): { words: Found[]; kanji: string[] } {
  const words: Found[] = [];
  const kanji: string[] = [];
  const segments = segmentSentenceIntoWords(run);
  // 분절 결과를 글자 위치로 바꿔 둔다 — 활용형이 분절 몇 조각을 덮는지 알아야 한다.
  const spans: { start: number; end: number; entry: WordEntry | null; isKanji: boolean }[] = [];
  let at = 0;
  for (const seg of segments) {
    spans.push({ start: at, end: at + seg.text.length, entry: seg.word, isKanji: Boolean(seg.kanji) });
    at += seg.text.length;
  }

  let i = 0;
  while (i < run.length) {
    const plain = spans.find((s) => s.start === i);
    const plainLen = plain ? plain.end - plain.start : 1;
    let best: Found | null = null;
    // 활용형은 사전형보다 길다 — 분절보다 길게 잡힐 때만 쓴다. 12글자면 「勉強していました」까지 덮는다.
    for (let len = Math.min(12, run.length - i); len > plainLen; len--) {
      const entry = deinflect(run.slice(i, i + len));
      if (entry) {
        best = { entry, text: run.slice(i, i + len) };
        break;
      }
    }
    if (best) {
      words.push(best);
      i += best.text.length;
      continue;
    }
    if (plain?.entry) words.push({ entry: plain.entry, text: run.slice(plain.start, plain.end) });
    else if (plain?.isKanji) kanji.push(run[i]);
    i += plainLen;
  }
  return { words, kanji };
}

/** 실을 만한 낱말인가 — 틀린 참고가 섞이지 않게 걸러낸다(머리 주석 참고). */
function isWorthGrounding({ entry, text }: Found): boolean {
  if (entry.pos.length > 0 && entry.pos.every((p) => FUNCTION_POS.has(p))) return false;
  if (!KANJI.test(text) && text.length <= 2) return false;
  return true;
}

function headword(entry: WordEntry): string {
  // 가나로 쓰는 단어(為 → ため)는 가나로 적는다 — 한자로 적으면 모델이 답에 為를 쓴다.
  return entry.usuallyKana ? entry.reading : entry.word;
}

const MEANING_MAX = 40;

/**
 * 뜻 한 토막. 한국어 뜻풀이는 **앞 세 개까지** 싣는다 — 첫 하나만 쓰면 本이 「이」(접두어 本)로만 나간다
 * (원본의 첫 뜻풀이가 그렇다). 셋을 주면 모델이 문맥에 맞는 쪽(책)을 고른다. 한국어가 없으면 영어 앞 두 뜻.
 */
function meaningFor(entry: WordEntry): string {
  const korean = (entry.koreanMeaning ?? [])
    .map((m) => m.replace(/^[.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const text = korean.length > 0 ? korean.join(" / ") : entry.meaning.split(/;\s*/).slice(0, 2).join("; ");
  return text.length > MEANING_MAX ? `${text.slice(0, MEANING_MAX - 1)}…` : text;
}

function wordLine({ entry, text }: Found): string {
  const head = headword(entry);
  const parts = [`- ${head}`];
  if (head !== entry.reading) parts[0] += ` (${entry.reading})`;
  const pos = [...new Set(entry.pos.filter((p) => !["vi", "vt"].includes(p)).map(translatePos))].slice(0, 2);
  if (entry.pos.includes("vi")) pos.push("자동사");
  if (entry.pos.includes("vt")) pos.push("타동사");
  if (pos.length > 0) parts.push(pos.join("·"));
  parts.push(`뜻: ${meaningFor(entry)}`);
  if (text !== entry.word && text !== entry.reading) parts.push(`문장 속 「${text}」`);
  const table = TABLE_FORMS.map((form) => {
    const c = conjugateVerb(entry, form);
    if (!c) return null;
    // 가나로 쓰는 동사(居る → いる)는 활용형도 가나로 — 「居ます」라고 적으면 모델이 그대로 옮긴다.
    return `${VERB_FORM_LABEL[form].name} ${entry.usuallyKana ? (c.reading ?? c.kanji) : c.kanji}`;
  }).filter((x): x is string => x !== null);
  if (table.length > 0) parts.push(`활용: ${table.join(", ")}`);
  return parts.join(" · ");
}

function kanjiLine(literal: string): string | null {
  const k = getKanjiEntry(literal);
  if (!k) return null;
  const parts = [`- ${literal} (한자)`];
  if (k.onyomi.length) parts.push(`음독 ${k.onyomi.slice(0, 2).join("·")}`);
  if (k.kunyomi.length) parts.push(`훈독 ${k.kunyomi.slice(0, 2).join("·")}`);
  if (k.koreanReading.length) parts.push(`한국 한자음 ${k.koreanReading.slice(0, 2).join("·")}`);
  if (k.meaning.length) parts.push(`뜻: ${k.meaning.slice(0, 2).join(", ")}`);
  return parts.join(" · ");
}

/** 글에서 일본어 구간만 모은다(한국어 질문 속 「…」 인용도 잡힌다). */
export function japaneseRuns(text: string): string[] {
  return (text.match(JAPANESE_RUN) ?? []).filter((run) => HAS_KANA_OR_KANJI.test(run));
}

/**
 * 질문 옆에 붙일 사전 참고 블록. 실을 것이 없으면 null(한국어만 있는 질문 등).
 *
 * `sources`는 일본어를 찾아볼 글들이다 — 보통 지금 질문 하나, 질문에 일본어가 없고 앞을 가리키면
 * 직전 예문(「부정형으로 바꾸면?」은 앞 문장의 동사 활용이 필요하다). `curriculum`이 없으면 문형은 건너뛴다.
 */
export function buildTeacherGrounding(sources: readonly string[], curriculum: Curriculum | null): string | null {
  let text = sources.flatMap(japaneseRuns).join("\n");
  if (!text) return null;
  text = text.slice(0, GROUNDING_MAX_TEXT);

  const wordLines: string[] = [];
  const seen = new Set<string>();
  for (const run of japaneseRuns(text)) {
    const { words, kanji } = findGroundingWords(run);
    for (const found of words) {
      if (wordLines.length >= GROUNDING_MAX_WORDS) break;
      if (seen.has(found.entry.id) || !isWorthGrounding(found)) continue;
      seen.add(found.entry.id);
      wordLines.push(wordLine(found));
    }
    for (const literal of kanji) {
      if (wordLines.length >= GROUNDING_MAX_WORDS) break;
      if (seen.has(literal)) continue;
      seen.add(literal);
      const line = kanjiLine(literal);
      if (line) wordLines.push(line);
    }
  }

  const grammarLines: string[] = [];
  if (curriculum) {
    const seenPattern = new Set<string>();
    for (const run of japaneseRuns(text)) {
      for (const match of findGrammarInSentence(curriculum, run)) {
        if (grammarLines.length >= GROUNDING_MAX_GRAMMAR || seenPattern.has(match.point.pattern)) continue;
        seenPattern.add(match.point.pattern);
        grammarLines.push(`- ${match.point.pattern} (${match.level}): ${match.point.meaning}`);
      }
    }
  }

  if (wordLines.length === 0 && grammarLines.length === 0) return null;
  const lines = [
    "[사전 참고] 앱의 사전·활용 규칙에서 찾은 정보입니다(학습자가 쓴 글이 아닙니다).",
    "읽기·뜻·활용형·문형은 이 정보를 따르고, 여기 없는 읽기나 활용형을 지어내지 마세요. 목록을 그대로 옮겨 적지는 말고 설명에 녹이세요.",
    ...wordLines,
  ];
  if (grammarLines.length > 0) lines.push("[문형 참고]", ...grammarLines);
  return lines.join("\n");
}
