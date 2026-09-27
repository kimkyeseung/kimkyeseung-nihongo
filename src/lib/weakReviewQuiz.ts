// "약한 것 모아 풀기"의 문제를 만든다. 한자는 기존 읽기 퀴즈(kanjiQuiz.ts)를 그대로 쓰고,
// 단어는 "이 단어의 뜻은?" 4지선다를 여기서 만든다. **보기는 전부 사전 데이터에서** 뽑는다 —
// 뜻풀이를 LLM이 지어내면 안 된다는 규칙 그대로다.
//
// 사전(2.9MB)을 끌어오는 모듈이라 풀기 시트(WeakReviewSheet)에서만, 그것도 lazy로 쓴다.

import type { KanjiQuizQuestion } from "./kanjiQuiz";
import type { WordEntry } from "../types/dictionary";
import type { ReviewWord } from "./weakReview";

export interface WordMeaningQuestion {
  word: WordEntry;
  choices: string[];
  answerIndex: number;
}

export type ReviewQuestion =
  | { kind: "kanji"; question: KanjiQuizQuestion }
  | { kind: "word"; question: WordMeaningQuestion };

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 기록에 남은 표기로 사전 항목을 다시 찾는다. **표기가 같은 단어가 여럿**이라(上手 じょうず /
 * うわて) 뜻을 찾아볼 때 남긴 읽기가 있으면 그걸로 가르고, 없으면 흔한 단어를 고른다.
 */
export function resolveReviewWord(target: ReviewWord, dictionary: readonly WordEntry[]): WordEntry | undefined {
  const same = dictionary.filter((w) => w.word === target.word);
  if (same.length === 0) return undefined;
  return (
    (target.reading && same.find((w) => w.reading === target.reading)) ||
    same.find((w) => w.common) ||
    same[0]
  );
}

/** 보기 한 줄의 최대 길이. 넘으면 말줄임 — 보기 네 개가 화면을 넘기지 않게. */
const CHOICE_MAX_LENGTH = 32;

function clip(text: string): string {
  const t = text.trim();
  return t.length > CHOICE_MAX_LENGTH ? `${t.slice(0, CHOICE_MAX_LENGTH - 1)}…` : t;
}

/**
 * 보기에 쓸 **짧은** 뜻. `displayMeaning`은 뜻풀이 전체를 이어 붙여서 고어 뜻까지 딸린 몇 줄짜리
 * 보기가 나왔다. 한국어는 첫 뜻풀이의 앞 두 마디, 영어는 앞 두 뜻만 쓴다.
 */
export function shortMeaning(entry: WordEntry): string {
  const korean = entry.koreanMeaning?.[0];
  if (korean) return clip(korean.split(/[.;]\s*/).filter(Boolean).slice(0, 2).join(". "));
  return clip(entry.meaning.split(/;\s*/).slice(0, 2).join("; "));
}

/** 뜻이 한국어인가. 한국어 뜻은 전체의 절반쯤에만 있고 나머지는 영어로 폴백한다. */
function hasKorean(entry: WordEntry): boolean {
  return Boolean(entry.koreanMeaning?.length);
}

/**
 * 뜻 4지선다. 오답 보기는 **같은 급수의 흔한 단어**에서 — 급수가 다르면 너무 쉬워지고(뜻만 봐도
 * 어려운 말이 티가 난다), 흔하지 않은 단어는 뜻풀이가 낯설어 오답이 뻔해진다. 뜻풀이 글자가 정답과
 * 같은 단어(동의어)는 빼고, 보기끼리도 겹치지 않게 한다 — 같은 보기가 둘이면 맞혀도 틀린 셈이 된다.
 * 모자라면 급수 제한을 푼다.
 *
 * **보기는 정답과 같은 언어로만 고른다 (실제로 겪었다).** 한국어 뜻이 없는 단어는 영어로
 * 폴백하는데, 섞어 뽑았더니 정답은 한국어, 오답 둘은 `postcard`·`isn't that right?`라 뜻을 몰라도
 * 한국어 보기만 고르면 맞았다.
 */
export function buildWordMeaningQuestion(
  word: WordEntry,
  dictionary: readonly WordEntry[],
  random: () => number = Math.random
): WordMeaningQuestion | null {
  const answer = shortMeaning(word);
  const korean = hasKorean(word);
  if (!answer) return null;

  const picked = new Set<string>([answer]);
  const distractors: string[] = [];
  const tryPool = (pool: readonly WordEntry[]) => {
    for (const w of shuffle(pool as WordEntry[], random)) {
      if (distractors.length >= 3) return;
      if (w.id === word.id || w.word === word.word) continue;
      if (hasKorean(w) !== korean) continue;
      const meaning = shortMeaning(w);
      if (!meaning || picked.has(meaning)) continue;
      picked.add(meaning);
      distractors.push(meaning);
    }
  };
  tryPool(dictionary.filter((w) => w.common && w.jlptLevel === word.jlptLevel));
  if (distractors.length < 3) tryPool(dictionary.filter((w) => w.common));
  if (distractors.length < 3) return null;

  const choices = shuffle([answer, ...distractors], random);
  return { word, choices, answerIndex: choices.indexOf(answer) };
}

/**
 * 한자 문제와 단어 문제를 **번갈아** 섞는다 — 한쪽을 몰아서 내면 앞 다섯 문제가 전부 한자인
 * 식이 되어, 중간에 그만두면 단어는 한 번도 못 본다.
 */
export function interleaveReviewQuestions(
  kanji: KanjiQuizQuestion[],
  words: WordMeaningQuestion[]
): ReviewQuestion[] {
  const out: ReviewQuestion[] = [];
  for (let i = 0; i < Math.max(kanji.length, words.length); i++) {
    if (kanji[i]) out.push({ kind: "kanji", question: kanji[i] });
    if (words[i]) out.push({ kind: "word", question: words[i] });
  }
  return out;
}
