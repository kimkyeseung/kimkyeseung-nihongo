import type { JlptLevel } from "./jlpt";

/**
 * 레벨 진단(`/level`)과 단원 점검(`/test`)이 함께 쓰는 문제 은행(`src/data/level-test-bank.json`).
 * **손으로 만든 데이터다** — `curriculum.json`처럼 `scripts/data` 파이프라인 밖에 있다.
 * JLPT 기출·시판 문제집 문장을 옮기지 말 것(저작권). 문형은 커리큘럼을 따르되 문장은 새로 쓴다.
 * 모양 검사는 `levelTestBank.test.ts`가 한다.
 */

/** 문법 빈칸 문제. 빈칸은 `sentence` 안의 「＿＿」 하나다. */
export type GrammarItem = {
  /** "g-n5-001" */
  id: string;
  level: JlptLevel;
  /** `curriculum.json`의 `grammarPoints[].pattern`과 **같은 문자열** — 단원 점검이 이걸로 찾는다. */
  pattern: string;
  sentence: string;
  /** 정확히 4개. 정답 1 + 오답 3. 순서는 화면에서 코드가 섞는다. */
  choices: string[];
  /** `choices`의 인덱스 */
  answer: number;
  /** 정답을 넣은 문장의 한국어 번역(결과 화면 해설용) */
  translation: string;
  /** 왜 다른 보기가 안 되는지 한 줄 */
  note?: string;
};

export type ReadingItem = {
  id: string;
  level: JlptLevel;
  passage: string;
  /** 한국어 질문 */
  question: string;
  /** 한국어 4개 */
  choices: string[];
  answer: number;
};

export type ListeningLine = { speaker?: "A" | "B"; text: string };

export type ListeningItem = {
  id: string;
  level: JlptLevel;
  /** TTS로 읽을 대사. 화면에는 풀고 난 뒤에만 보인다. */
  script: ListeningLine[];
  /** 한국어 질문(화면에 보인다) */
  question: string;
  /** 한국어 4개 */
  choices: string[];
  answer: number;
};

export type LevelTestBank = {
  meta: { version: number; note: string };
  grammar: GrammarItem[];
  reading: ReadingItem[];
  listening: ListeningItem[];
};
