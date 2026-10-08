import type { JlptLevel } from "./jlpt";
import type { CurriculumLevelId } from "./curriculum";

/** 진단 영역. 가나(`kana`)는 어휘 결과를 보고 조건부로 붙는다. */
export type LevelTestSection = "kana" | "vocab" | "kanji" | "grammar" | "reading" | "listening";

/** 계단식으로 도는 영역 — 문항이 많아 급수를 오르내리며 좁혀 간다. */
export type StaircaseSection = "vocab" | "kanji" | "grammar";

/** 문항이 2~3개뿐이라 계단을 못 만드는 영역 — 맞히면 한 급수 위, 틀리면 한 급수 아래 하나 더. */
export type ShortSection = "reading" | "listening";

/** 추정 급수. JLPT 급수 아래로 떨어지면 `"Pre-N5"`(커리큘럼의 문자 단계)다. */
export type EstimatedLevel = CurriculumLevelId;

/** 왜 그 영역이 끝났는가 */
export type SectionEndReason =
  | "reversals" // 방향이 3번 바뀌었다 — 경계를 찾았다
  | "limit" // 상한까지 갔다 — 경계를 못 찾았을 수 있다
  | "floor"; // N5에서 2개 연속 틀렸다 — 문자 영역이 필요하다

export type AdaptiveAnswer = { level: JlptLevel; correct: boolean };

/** 한 영역의 적응형 진행 상태. 직렬화 가능한 순수 값이다(메모리 스토어에 그대로 둔다). */
export type AdaptiveState = {
  section: StaircaseSection | ShortSection;
  /** 다음 문제를 낼 급수 */
  level: JlptLevel;
  /** 연속 정답 수(계단식) — 2가 되면 한 급수 올라간다 */
  streak: number;
  /** 마지막으로 움직인 방향. 1 = 위(어려운 쪽), -1 = 아래, 0 = 아직 안 움직임 */
  lastDirection: -1 | 0 | 1;
  /** 방향이 바뀐 횟수 */
  reversals: number;
  /** N5에서 연달아 틀린 수 */
  floorMisses: number;
  answers: AdaptiveAnswer[];
  /** 끝났으면 이유, 아니면 null */
  done: SectionEndReason | null;
};

/** 영역 하나의 결과 요약. 결과 화면·저장·총평 프롬프트가 이 모양을 쓴다. */
export type SectionResult = {
  /** null이면 "측정 안 함"(청해에 음성이 없을 때 등) — 0점과 다르다 */
  estimate: EstimatedLevel | null;
  correct: number;
  total: number;
  /** 상한까지 가고도 경계를 못 찾았으면 false — "조금 더 풀어봐야 정확해요" */
  confident: boolean;
};

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
