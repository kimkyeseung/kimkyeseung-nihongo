import { kanjiList } from "./kanji";
import type { KanjiEntry } from "../types/kanji";

export type KanjiQuizQuestion = {
  kanji: KanjiEntry;
  choices: string[];
  answerIndex: number;
};

const QUIZ_QUESTION_COUNT = 10;

// 훈독을 우선하고(뜻과 함께 외우기 좋음) 없으면 음독, 그마저 없으면 뜻으로 대체한다.
function primaryReading(entry: KanjiEntry): string {
  return entry.kunyomi[0] ?? entry.onyomi[0] ?? entry.meaning[0] ?? entry.kanji;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 학습 미완료 한자 pool로 읽기 4지선다 문제를 만든다. 오답 보기는 사전적 사실을
 * LLM이 지어내지 않도록 전체 한자 데이터(kanjiList)에서만 뽑는다.
 */
export function buildKanjiQuiz(pool: KanjiEntry[]): KanjiQuizQuestion[] {
  const targets = shuffle(pool).slice(0, QUIZ_QUESTION_COUNT);

  return targets.map((entry) => {
    const answer = primaryReading(entry);
    const distractorPool = kanjiList.filter(
      (k) => k.kanji !== entry.kanji && primaryReading(k) !== answer
    );
    const distractors = shuffle(distractorPool)
      .map(primaryReading)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 3);

    const choices = shuffle([answer, ...distractors]);
    return { kanji: entry, choices, answerIndex: choices.indexOf(answer) };
  });
}
