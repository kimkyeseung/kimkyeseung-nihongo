import { toKatakana } from "wanakana";
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
function isPureForm(word: string, kanji: string): boolean {
  if (!word.startsWith(kanji)) return false;
  const rest = word.slice(kanji.length);
  return rest.length === 0 || HIRAGANA_ONLY.test(rest);
}

// 한자 -> 그 한자가 실제로 쓰인 단어 목록(단독/오쿠리가나 형태 우선, 그다음 JLPT 낮은
// 순=기초 어휘 우선) 캐시. dictionary.json(8천여 개)을 한자마다 매번 훑지 않도록
// 한자당 한 번만 계산해 재사용한다.
const wordsByKanjiCache = new Map<string, WordEntry[]>();

function wordsContaining(kanji: string): WordEntry[] {
  let cached = wordsByKanjiCache.get(kanji);
  if (!cached) {
    cached = dictionary
      .filter((w) => w.furigana?.some((f) => f.ruby === kanji))
      .sort(
        (a, b) =>
          Number(!isPureForm(a.word, kanji)) - Number(!isPureForm(b.word, kanji)) ||
          (JLPT_ORDER[a.jlptLevel] ?? 99) - (JLPT_ORDER[b.jlptLevel] ?? 99) ||
          Number(b.common) - Number(a.common)
      );
    wordsByKanjiCache.set(kanji, cached);
  }
  return cached;
}

const readingCache = new Map<string, string>();

/**
 * KANJIDIC2의 onyomi/kunyomi 배열 순서는 "가장 잘 알려진 읽기" 순이 아니라 사전 편집
 * 순서라서, 예전처럼 kunyomi[0]을 그냥 쓰면 食의 첫 훈독인 "く.う"가 뽑혀 훨씬 더 잘 알려진
 * "た.べる"(食べる)가 퀴즈 정답 후보에서 통째로 빠지는 문제가 있었다(실제로 이렇게 보고받음).
 * dictionary.json의 furigana는 JMDict_Extended가 실제 단어에서 이 한자가 정확히 어떤 음으로
 * 읽히는지 이미 분리해뒀으므로(예: "食べる" -> [{ruby:"食", rt:"た"}, ...]), 이 한자가 들어간
 * 가장 기초적인(JLPT 낮은) 실제 단어를 찾아 거기서 쓰인 읽기를 정답으로 삼는다.
 */
function primaryReading(entry: KanjiEntry): string {
  const cached = readingCache.get(entry.kanji);
  if (cached) return cached;

  let result: string | undefined;
  for (const word of wordsContaining(entry.kanji)) {
    const rt = word.furigana!.find((f) => f.ruby === entry.kanji)?.rt;
    if (!rt) continue;
    result =
      entry.kunyomi.find((k) => k.split(".")[0] === rt) ??
      entry.onyomi.find((o) => o === toKatakana(rt));
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
