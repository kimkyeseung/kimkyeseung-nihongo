import { toHiragana } from "wanakana";
import { kanjiList } from "./kanji";
import { dictionary } from "./dictionary";
import type { KanjiEntry } from "../types/kanji";
import type { WordEntry } from "../types/dictionary";

export type KanjiQuizQuestion = {
  kanji: KanjiEntry;
  choices: string[];
  answerIndex: number;
};

const QUIZ_QUESTION_COUNT = 10;
const JLPT_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const HIRAGANA_ONLY = /^[぀-ゟ]+$/;

// 단어가 이 한자 하나만으로 시작하고 나머지가 전부 히라가나인지(단독 명사 또는
// 오쿠리가나 붙은 동사/형용사, 예: "食べる"/"人")를 본다. 다른 한자가 섞인 복합어
// (예: "外国人", "食堂")는 이 한자 자체의 대표 읽기를 보여주기엔 덜 적합해서 후순위로 민다.
// 단, common 여부와 JLPT 급수보다는 후순위 기준이다 — 아래 wordsContaining 참고.
function isPureForm(word: string, kanji: string): boolean {
  if (!word.startsWith(kanji)) return false;
  const rest = word.slice(kanji.length);
  return rest.length === 0 || HIRAGANA_ONLY.test(rest);
}

// 한자 -> 그 한자가 실제로 쓰인 단어 목록(자주 쓰이는 순) 캐시. dictionary.json(8천여
// 개)을 한자마다 매번 훑지 않도록 한자당 한 번만 계산해 재사용한다.
//
// 정렬 우선순위는 반드시 common(실제 흔히 쓰이는 단어인지) 먼저, 그다음 JLPT 급수,
// 마지막에 pure-form 순이어야 한다. 처음엔 JLPT나 pure-form을 common보다 앞에 뒀다가
// 둘 다 실패 사례가 나왔다: pure-form을 최우선으로 두면 "業"(ごう, N1, 안 흔함)처럼
// 단독으로 존재하기만 하면 "授業"(ぎょう, N5, 흔함)보다 이겨버렸고, JLPT를 common보다
// 앞에 두면 "建て"(N5 태그지만 안 흔한 단어)가 "建設"(N3, 아주 흔한 단어)를 이겨버렸다.
// common을 최우선에 둬야 이런 사례가 전부 해결된다(2,135자 전수 검사로 확인).
const wordsByKanjiCache = new Map<string, WordEntry[]>();

function wordsContaining(kanji: string): WordEntry[] {
  let cached = wordsByKanjiCache.get(kanji);
  if (!cached) {
    cached = dictionary
      .filter((w) => w.furigana?.some((f) => f.ruby === kanji))
      .sort(
        (a, b) =>
          Number(b.common) - Number(a.common) ||
          (JLPT_ORDER[a.jlptLevel] ?? 99) - (JLPT_ORDER[b.jlptLevel] ?? 99) ||
          Number(!isPureForm(a.word, kanji)) - Number(!isPureForm(b.word, kanji))
      );
    wordsByKanjiCache.set(kanji, cached);
  }
  return cached;
}

// 탁음화/반탁음화(か→が, は→ぱ 등) 비교용 매핑.
const VOICING: Record<string, string> = {
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ",
  ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と",
  ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ",
};
function devoice(ch: string): string {
  return VOICING[ch] ?? ch;
}

// 두 가나 문자열이 탁음화/반탁음화(예: 邦ホウ -> 連邦れん"ぽう") 또는 마지막 음절의
// 촉음화(예: 喫キツ -> 喫茶きっ"さ") 정도의 차이만 있으면 "실질적으로 같은 읽기"로 본다.
// 한자 하나 안에서 쓰인 읽기가 KANJIDIC2의 onyomi/kunyomi 표기와 정확히 문자열 일치하지
// 않는 경우가 있어서(일본어의 흔한 음운 변화), 이 완화된 비교가 없으면 실제로는 정답인
// 단어를 후보에서 놓친다.
function soundsLike(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (ca === cb) continue;
    if (devoice(ca) === devoice(cb)) continue;
    if ((ca === "っ" || cb === "っ") && i === a.length - 1) continue;
    return false;
  }
  return true;
}

function extractReading(entry: KanjiEntry, word: WordEntry): string | null {
  const rt = word.furigana!.find((f) => f.ruby === entry.kanji)?.rt;
  if (!rt) return null;
  return (
    entry.kunyomi.find((k) => k.split(".")[0] === rt) ??
    entry.onyomi.find((o) => toHiragana(o) === rt) ??
    entry.kunyomi.find((k) => soundsLike(k.split(".")[0], rt)) ??
    entry.onyomi.find((o) => soundsLike(toHiragana(o), rt)) ??
    null
  );
}

const readingCache = new Map<string, string>();

/**
 * KANJIDIC2의 onyomi/kunyomi 배열 순서는 "가장 잘 알려진 읽기" 순이 아니라 사전 편집
 * 순서라서, 예전처럼 kunyomi[0]을 그냥 쓰면 食의 첫 훈독인 "く.う"가 뽑혀 훨씬 더 잘 알려진
 * "た.べる"(食べる)가 퀴즈 정답 후보에서 통째로 빠지는 문제가 있었다(실제로 이렇게 보고받음).
 * dictionary.json의 furigana는 JMDict_Extended가 실제 단어에서 이 한자가 정확히 어떤 음으로
 * 읽히는지 이미 분리해뒀으므로(예: "食べる" -> [{ruby:"食", rt:"た"}, ...]), 이 한자가 들어간
 * 가장 흔히 쓰이는 실제 단어를 찾아 거기서 쓰인 읽기를 정답으로 삼는다.
 */
function primaryReading(entry: KanjiEntry): string {
  const cached = readingCache.get(entry.kanji);
  if (cached) return cached;

  let result: string | undefined;
  for (const word of wordsContaining(entry.kanji)) {
    result = extractReading(entry, word) ?? undefined;
    if (result) break;
  }
  result ??= entry.kunyomi[0] ?? entry.onyomi[0] ?? entry.meaning[0] ?? entry.kanji;

  readingCache.set(entry.kanji, result);
  return result;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// pool 전체에 primaryReading을 미리 계산하지 않고, 필요한 개수(3개)를 찾을 때까지만
// 섞인 순서대로 훑는다 — pool이 2천 자를 넘어갈 수 있어 매번 전부 계산하면 낭비가 크다.
function pickDistractors(pool: KanjiEntry[], answer: string, count: number): string[] {
  const results: string[] = [];
  for (const entry of shuffle(pool)) {
    const reading = primaryReading(entry);
    if (reading === answer || results.includes(reading)) continue;
    results.push(reading);
    if (results.length >= count) break;
  }
  return results;
}

/**
 * 학습 미완료 한자 pool로 읽기 4지선다 문제를 만든다. 오답 보기는 사전적 사실을
 * LLM이 지어내지 않도록 전체 한자 데이터(kanjiList)에서만 뽑는다.
 */
export function buildKanjiQuiz(pool: KanjiEntry[]): KanjiQuizQuestion[] {
  const targets = shuffle(pool).slice(0, QUIZ_QUESTION_COUNT);

  return targets.map((entry) => {
    const answer = primaryReading(entry);
    const distractorPool = kanjiList.filter((k) => k.kanji !== entry.kanji);
    const distractors = pickDistractors(distractorPool, answer, 3);

    const choices = shuffle([answer, ...distractors]);
    return { kanji: entry, choices, answerIndex: choices.indexOf(answer) };
  });
}
