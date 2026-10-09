import { toHiragana } from "wanakana";
import { JLPT_LEVELS, type JlptLevel } from "../../types/jlpt";
import type { KanjiEntry } from "../../types/kanji";
import type { WordEntry } from "../../types/dictionary";
import type {
  GrammarItem,
  LevelTestBank,
  ListeningItem,
  ReadingItem,
} from "../../types/levelTest";
import { GOJUON_SECTIONS, type KanaCell } from "../../data/gojuon";
import { shortMeaning } from "../weakReviewQuiz";
import { koreanTokens } from "../koreanMeaning";
import { readingInWord, soundsLike, wordsContainingKanji } from "../kanjiReading";

// 레벨 진단의 영역별 문제 만들기. **LLM을 쓰지 않는다** — 어휘 뜻·한자 읽기는 사전/KANJIDIC,
// 문법·독해·청해는 손으로 만든 문제 은행에서 낸다(정답이 정해진 정보는 모델이 지어내면 안 된다).
//
// 전부 순수 함수이고 데이터는 인자로 받는다. 사전(7.7MB)을 여기서 import하면 진단 페이지가 사전을
// 다 받기 전에는 인사 화면조차 못 띄운다. `questions.test.ts`가 실제 데이터로 급수마다 수백 번 돌려
// "보기 4개가 서로 다르고 같은 언어"인지 검사한다 — 보기가 겹치거나 정답만 한국어면 뜻을 몰라도
// 맞혀서, 진단이 조용히 높게 나온다.

export type ChoiceQuestionBase = {
  /** 같은 진단 안에서 다시 내지 않으려고 기억하는 열쇠들(문제·정답 단어·정답 한자) */
  keys: string[];
  /** 문제의 급수. 가나는 급수가 없다(null). */
  level: JlptLevel | null;
  choices: string[];
  answerIndex: number;
};

export type LevelTestQuestion = ChoiceQuestionBase &
  (
    | { kind: "kana"; char: string; script: "hiragana" | "katakana" }
    /** 커리큘럼이 직접 들고 있는 낱말·인사말(Pre-N5 단원 점검) — 보기는 한국어 뜻 */
    | { kind: "item"; text: string; reading: string }
    | { kind: "vocab"; word: WordEntry; display: string }
    | { kind: "kanji"; kanji: string; word: WordEntry }
    | { kind: "grammar"; item: GrammarItem }
    | { kind: "reading"; item: ReadingItem }
    | { kind: "listening"; item: ListeningItem }
  );

type Random = () => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(items: readonly T[], random: Random): T | undefined {
  return items.length ? items[Math.floor(random() * items.length)] : undefined;
}

/** 정답 하나 + 오답 셋을 섞어 문제 모양으로 */
function withChoices(answer: string, distractors: string[], random: Random) {
  const choices = shuffle([answer, ...distractors], random);
  return { choices, answerIndex: choices.indexOf(answer) };
}

const KANA_OR_KANJI = /[぀-ヿ一-鿿]/;
const HANGUL = /[가-힣]/;
const KATAKANA_ONLY = /^[゠-ヿ]+$/;
const HIRAGANA_ONLY = /^[぀-ゟ]+$/;

// ───────────────────────────── 어휘 ─────────────────────────────

/** 오답을 고를 때 맞추는 품사 계열. 다른 계열이 섞이면 '~다'로 끝나는 보기만 동사라 티가 난다. */
export type PosFamily = "noun" | "verb" | "adj" | "adv";

const VERB_POS = /^(v1|v1-s|v5.*|vk|vz|vs-i|vs-s)$/;
const ADJ_POS = new Set(["adj-i", "adj-ix", "adj-na"]);

/**
 * 품사 계열. 표에 적은 코드만 받는다 — `n-suf`(접미사)·`n-pref`·`num`도 `n`으로 시작하고, 고어 동사
 * (`v2*`·`v4*`)는 뜻풀이가 낯설다. 감탄사·조사·접속사처럼 "뜻"을 묻기 어려운 것은 null(출제 제외).
 */
export function posFamily(pos: readonly string[]): PosFamily | null {
  for (const p of pos) {
    if (p === "vt" || p === "vi") continue; // 자/타동사 표시 — 계열과 상관없다
    if (p === "n") return "noun";
    if (VERB_POS.test(p)) return "verb";
    if (ADJ_POS.has(p)) return "adj";
    if (p === "adv") return "adv";
  }
  return null;
}

/** 화면에 내는 표기 — 보통 가나로 쓰는 단어(為 → ため)는 읽기로 낸다. 후리가나는 붙이지 않는다. */
export function vocabDisplay(word: WordEntry): string {
  return word.usuallyKana ? word.reading : word.word;
}

/**
 * 어휘 영역에 낼 수 있는 단어인가.
 * - 급수가 있고(급수 외 단어는 진단에 안 쓴다 — 급수를 지어내지 않는다), 흔한 단어고, 한국어 뜻이
 *   있다(보기는 정답과 같은 언어로만 — 한국어 뜻이 없으면 아예 안 낸다).
 * - 짧은 뜻에 가나·한자가 섞이지 않았다(「아파트(단 マンション보다…)」 — 보기에 일본어가 보이면 안 된다).
 * - 뜻 대신 문법 설명이 적힌 항목(「어간의 하나」)은 뺀다 — `NOT_A_MEANING` 참고.
 * - 짧은 뜻이 18자를 넘으면 뺀다. 「일본에서 장관을 일컫는 말. 대신」(大臣) 같은 설명형 뜻은 짧은 보기들
 *   사이에서 길이만으로 티가 난다 — 정답으로도 오답으로도 쓰지 않는다.
 * - 가타카나만으로 된 외래어는 뺀다. 한국어 화자는 소리만 읽어도 뜻을 맞혀서(エレベーター) 어휘
 *   실력보다 높게 나온다. 가타카나를 읽는 힘은 문자 영역이 본다.
 */
const VOCAB_MEANING_MAX = 18;

/**
 * 뜻이 아니라 **문법 설명**인 한국어 뜻풀이. 원본(한국어 위키낱말사전)에는 한 글자 한자 항목에
 * 「어간의 하나」(34개 — 国·画·戦…)·「다음 단어를 만듦」(27개)처럼 뜻 대신 쓰임새를 적은 줄이 있다.
 * 보기로 나오면 단어를 몰라도 "이건 뜻이 아니니 오답"으로 지울 수 있고, 정답으로 나오면 国의 뜻이
 * 「어간의 하나」가 된다. 새 패턴을 보면 여기에 더할 것.
 */
const NOT_A_MEANING =
  /어간의 하나|어소의 하나|음독의 하나|접두사의 하나|접미사의 하나|다음 단어를 만듦|의 준말|의 약자|번째 문자|부록|상용한자/;

export function isVocabCandidate(word: WordEntry): boolean {
  if (!word.jlptLevel || !word.common || !word.koreanMeaning?.length) return false;
  if (!posFamily(word.pos)) return false;
  if (KATAKANA_ONLY.test(vocabDisplay(word))) return false;
  const meaning = shortMeaning(word);
  return (
    HANGUL.test(meaning) &&
    !KANA_OR_KANJI.test(meaning) &&
    meaning.length <= VOCAB_MEANING_MAX &&
    !NOT_A_MEANING.test(meaning)
  );
}

export type VocabPool = Record<JlptLevel, WordEntry[]>;

/**
 * 급수별 출제 후보. 페이지가 사전을 받은 뒤 한 번 만든다. **같은 표기가 둘 이상인 단어는 뺀다** —
 * 「上手」를 내면 じょうず(잘함)인지 うわて(한 수 위)인지 문제만 봐서는 알 수 없다.
 */
export function buildVocabPool(dictionary: readonly WordEntry[]): VocabPool {
  const displayCount = new Map<string, number>();
  for (const w of dictionary) {
    if (!w.jlptLevel) continue;
    const d = vocabDisplay(w);
    displayCount.set(d, (displayCount.get(d) ?? 0) + 1);
  }
  const pool = Object.fromEntries(JLPT_LEVELS.map((l) => [l, [] as WordEntry[]])) as VocabPool;
  for (const w of dictionary) {
    if (isVocabCandidate(w) && displayCount.get(vocabDisplay(w)) === 1) pool[w.jlptLevel!].push(w);
  }
  return pool;
}

/** 두 단어의 한국어 뜻풀이가 한 토막이라도 겹치나 — 다의어라 오답도 정답이 되는 경우를 막는다. */
function meaningsOverlap(a: WordEntry, b: WordEntry): boolean {
  const tokensA = new Set(koreanTokens(a.koreanMeaning ?? []));
  return koreanTokens(b.koreanMeaning ?? []).some((t) => tokensA.has(t));
}

/**
 * 어휘 문제 — 단어를 보고 한국어 뜻 고르기. 오답은 **같은 급수·같은 품사 계열**에서(모자라면 다른
 * 급수의 같은 계열에서), 보기끼리 글자가 겹치지 않고 뜻풀이 토막이 정답과 겹치지 않게 고른다.
 * 낼 단어가 없으면 null.
 */
export function buildVocabQuestion(
  level: JlptLevel,
  pool: VocabPool,
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  const candidates = pool[level].filter((w) => !used.has(`word:${w.id}`));
  const word = pickRandom(candidates, random);
  if (!word) return null;

  const family = posFamily(word.pos);
  const answer = shortMeaning(word);
  const picked = new Set([answer]);
  const distractors: string[] = [];
  const tryPool = (words: readonly WordEntry[]) => {
    for (const w of shuffle(words, random)) {
      if (distractors.length >= 3) return;
      if (w.id === word.id || posFamily(w.pos) !== family) continue;
      const meaning = shortMeaning(w);
      if (picked.has(meaning) || meaningsOverlap(word, w)) continue;
      picked.add(meaning);
      distractors.push(meaning);
    }
  };
  tryPool(pool[level]);
  if (distractors.length < 3) tryPool(JLPT_LEVELS.flatMap((l) => (l === level ? [] : pool[l])));
  if (distractors.length < 3) return null;

  return {
    kind: "vocab",
    word,
    display: vocabDisplay(word),
    level,
    keys: [`word:${word.id}`],
    ...withChoices(answer, distractors, random),
  };
}

// ───────────────────────────── 한자 읽기 ─────────────────────────────

const levelIndex = (l: JlptLevel) => JLPT_LEVELS.indexOf(l);

/** 단어 속 다른 한자가 물어보는 한자보다 몇 급수까지 어려워도 되나 */
const OTHER_KANJI_LEVEL_SLACK = 1;

const kanjiLevelCache = new WeakMap<readonly KanjiEntry[], Map<string, JlptLevel>>();

function kanjiLevels(kanjiList: readonly KanjiEntry[]): Map<string, JlptLevel> {
  let map = kanjiLevelCache.get(kanjiList);
  if (!map) {
    map = new Map(kanjiList.map((k) => [k.kanji, k.jlptLevel]));
    kanjiLevelCache.set(kanjiList, map);
  }
  return map;
}

/**
 * 한자의 읽기를 물을 단어들 — 그 한자가 든 **두 글자 이상의 흔한 단어**이고, 그 한자 자리의 읽기가
 * 히라가나로 분리돼 있는 것. 한 글자 단독(水 → みず)보다 단어 속 읽기(水曜日 → すい)가 실제 시험에
 * 가깝다. 앞쪽일수록 흔한 단어다.
 *
 * 단어의 급수만 보면 모자란다 — N5 한자 見을 「接見」으로 물었다(사전엔 N5로 적혀 있지만 接은 N3 한자다).
 * 그래서 **단어 속 다른 한자는 한 급수 위까지만** 허용한다. 같은 급수로 묶으면 「水曜日」(曜는 N4)
 * 같은 기본 단어가 빠져 N5 한자 중 문제를 낼 수 없는 글자가 생긴다. 앱에 없는 한자가 섞인 단어는 뺀다.
 */
export function kanjiQuestionWords(
  entry: KanjiEntry,
  kanjiList: readonly KanjiEntry[],
  dictionary: readonly WordEntry[],
): WordEntry[] {
  const levels = kanjiLevels(kanjiList);
  const max = levelIndex(entry.jlptLevel);
  return wordsContainingKanji(entry.kanji, dictionary).filter((w) => {
    if (w.word.length < 2 || !w.common || !w.jlptLevel) return false;
    if (levelIndex(w.jlptLevel) > max) return false;
    for (const ch of w.word) {
      if (!/[一-鿿]/.test(ch)) continue;
      const level = levels.get(ch);
      if (!level || levelIndex(level) > max + OTHER_KANJI_LEVEL_SLACK) return false;
    }
    const rt = readingInWord(entry.kanji, w);
    return !!rt && HIRAGANA_ONLY.test(rt);
  });
}

/** KANJIDIC 표기(훈독 "た.べる", 음독 "ショク", 접사 "-び")를 한자 자리에 오는 히라가나로 */
function kanjidicToKana(reading: string): string {
  return toHiragana(reading.replace(/^-|-$/g, "").split(".")[0]);
}

/**
 * 한자 하나로 읽기 문제를 만든다 — 단어 속 한자(밑줄)의 읽기를 고른다. 보기는 전부 히라가나.
 * - 오답 하나는 **같은 한자의 다른 읽기**(水曜日의 水에 みず) — 단어 속에서 어떻게 읽히는지를 묻는
 *   문제라 이게 진짜 함정이다. 나머지는 같은 급수의 다른 한자가 단어 속에서 읽힌 소리.
 * - 정답과 탁음·촉음만 다른 소리(じ/し, がく/がっ)는 오답으로 쓰지 않는다 — 한자를 알아도 헷갈린다.
 * 물을 단어가 없거나 오답이 모자라면 null. 단원 점검(unitCheck.ts)은 단원의 한자를 하나씩 넘긴다.
 */
export function buildKanjiQuestionFor(
  entry: KanjiEntry,
  kanjiList: readonly KanjiEntry[],
  dictionary: readonly WordEntry[],
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  if (used.has(`kanji:${entry.kanji}`)) return null;
  const words = kanjiQuestionWords(entry, kanjiList, dictionary).filter((w) => !used.has(`word:${w.id}`));
  const word = pickRandom(words.slice(0, 3), random);
  if (!word) return null;
  const answer = readingInWord(entry.kanji, word)!;

  const distractors: string[] = [];
  const accept = (reading: string) => {
    if (distractors.length >= 3 || !HIRAGANA_ONLY.test(reading)) return;
    if (soundsLike(reading, answer) || distractors.some((d) => soundsLike(d, reading))) return;
    distractors.push(reading);
  };
  const ownReadings = [...entry.kunyomi, ...entry.onyomi].map(kanjidicToKana);
  const own = pickRandom(ownReadings.filter((r) => HIRAGANA_ONLY.test(r) && !soundsLike(r, answer)), random);
  if (own) accept(own);
  for (const other of shuffle(kanjiList.filter((k) => k.jlptLevel === entry.jlptLevel), random)) {
    if (distractors.length >= 3) break;
    if (other.kanji === entry.kanji) continue;
    const otherWord = kanjiQuestionWords(other, kanjiList, dictionary)[0];
    const reading = otherWord && readingInWord(other.kanji, otherWord);
    if (reading) accept(reading);
  }
  if (distractors.length < 3) return null;

  return {
    kind: "kanji",
    kanji: entry.kanji,
    word,
    level: entry.jlptLevel,
    keys: [`kanji:${entry.kanji}`, `word:${word.id}`],
    ...withChoices(answer, distractors, random),
  };
}

/** 그 급수의 한자 중 아직 안 낸 것으로 읽기 문제를 하나(레벨 진단). */
export function buildKanjiQuestion(
  level: JlptLevel,
  kanjiList: readonly KanjiEntry[],
  dictionary: readonly WordEntry[],
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  for (const entry of shuffle(kanjiList.filter((k) => k.jlptLevel === level), random)) {
    const q = buildKanjiQuestionFor(entry, kanjiList, dictionary, used, random);
    if (q) return q;
  }
  return null;
}

// ───────────────────────────── 문법·독해·청해 (문제 은행) ─────────────────────────────

/** 은행 항목의 보기를 섞는다 — 은행은 정답 자리가 고정이라 그대로 내면 외워서 풀린다. */
function fromBank<T extends { id: string; level: JlptLevel; choices: string[]; answer: number }>(
  items: readonly T[],
  level: JlptLevel,
  used: ReadonlySet<string>,
  random: Random,
): { item: T; choices: string[]; answerIndex: number } | null {
  const item = pickRandom(
    items.filter((i) => i.level === level && !used.has(i.id)),
    random,
  );
  if (!item) return null;
  const answer = item.choices[item.answer];
  return { item, ...withChoices(answer, item.choices.filter((_, i) => i !== item.answer), random) };
}

export function buildGrammarQuestion(
  level: JlptLevel,
  bank: LevelTestBank,
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  const picked = fromBank(bank.grammar, level, used, random);
  return picked && { kind: "grammar", level, keys: [picked.item.id], ...picked };
}

export function buildReadingQuestion(
  level: JlptLevel,
  bank: LevelTestBank,
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  const picked = fromBank(bank.reading, level, used, random);
  return picked && { kind: "reading", level, keys: [picked.item.id], ...picked };
}

export function buildListeningQuestion(
  level: JlptLevel,
  bank: LevelTestBank,
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  const picked = fromBank(bank.listening, level, used, random);
  return picked && { kind: "listening", level, keys: [picked.item.id], ...picked };
}

// ───────────────────────────── 문자(가나) ─────────────────────────────

/** 오십음도의 청음 46자(빈칸 제외). */
export const SEION_CELLS: KanaCell[] = GOJUON_SECTIONS.filter((s) => s.tab === "seion").flatMap((s) =>
  s.rows.flatMap((r) => r.cells.filter((c): c is KanaCell => c !== null && !c.katakanaOnly)),
);

/**
 * 문자 영역 — 가나 한 글자를 보고 로마자 고르기. 청음 46자만 낸다(탁음·요음은 청음을 알면 따라온다).
 * 히라가나와 가타카나를 번갈아 낸다(`index` 짝수면 히라가나). 오답은 로마자가 다른 청음에서.
 */
export function buildKanaQuestion(
  seion: readonly KanaCell[],
  index: number,
  used: ReadonlySet<string>,
  random: Random = Math.random,
): LevelTestQuestion | null {
  const script = index % 2 === 0 ? "hiragana" : "katakana";
  const cell = pickRandom(
    seion.filter((c) => !used.has(`kana:${c.hiragana}`)),
    random,
  );
  if (!cell) return null;
  const distractors = [
    ...new Set(shuffle(seion, random).map((c) => c.romaji).filter((r) => r !== cell.romaji)),
  ].slice(0, 3);
  if (distractors.length < 3) return null;
  return {
    kind: "kana",
    char: cell[script],
    script,
    level: null,
    keys: [`kana:${cell.hiragana}`],
    ...withChoices(cell.romaji, distractors, random),
  };
}

/** 보기 글꼴 — 일본어 보기(문법·한자 읽기)는 font-ja, 한국어 뜻·로마자는 font-mixed */
export function choiceFont(q: LevelTestQuestion): string {
  return q.kind === "grammar" || q.kind === "kanji" ? "font-ja" : "font-mixed";
}
