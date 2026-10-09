import { kanjiList } from "./kanji";
import { dictionary } from "./dictionary";
import { primaryReading as primaryReadingIn } from "./kanjiReading";
import type { KanjiEntry } from "../types/kanji";

export type KanjiQuizQuestion = {
  kanji: KanjiEntry;
  choices: string[];
  answerIndex: number;
};

const QUIZ_QUESTION_COUNT = 10;

// 대표 읽기를 고르는 규칙(왜 KANJIDIC 배열 순서를 믿으면 안 되는지 등)은 kanjiReading.ts에 있다.
// 레벨 진단도 같은 규칙을 써야 해서 사전을 인자로 받는 모듈로 옮겼다.
const primaryReading = (entry: KanjiEntry) => primaryReadingIn(entry, dictionary);

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
