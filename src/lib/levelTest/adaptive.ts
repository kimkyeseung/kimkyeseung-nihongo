import type { JlptLevel } from "../../types/jlpt";
import type { CurriculumLevelId } from "../../types/curriculum";
import type { AdaptiveState, EstimatedLevel, LevelTestSection, MeasuredSection } from "../../types/levelTest";
import { bestNextLevel, isSettled, mostLikely, posterior, type Distribution } from "./inference";

// 레벨 진단의 적응형 출제 — "다음 문제를 어느 급수에서 낼까, 언제 멈출까, 그래서 몇 급인가".
// 전부 조용히 틀리는 계산이다: 문제는 멀쩡히 나오고, 결과 화면에는 그럴듯한 급수가 뜨고, 학습자는 그 급수로
// 커리큘럼을 시작해 버린다. 그래서 상태는 직렬화 가능한 순수 값으로 두고 `adaptive.test.ts`와 가상 학습자
// 시뮬레이션(`simulation.test.ts`)이 고정한다. 확률 계산은 `inference.ts`에 있다.

/** 영역별 문항 상한(가나는 고정 문항). 대부분 그 전에 확실해져서 끝난다. */
export const SECTION_MAX_ITEMS: Record<LevelTestSection, number> = {
  kana: 8,
  vocab: 12,
  kanji: 10,
  grammar: 12,
  reading: 5,
  listening: 5,
};

/** 이만큼은 풀어야 끝낸다 — 두 문제 운으로 판정이 나지 않게. */
export const SECTION_MIN_ITEMS: Record<MeasuredSection, number> = {
  vocab: 5,
  kanji: 5,
  grammar: 5,
  reading: 3,
  listening: 3,
};

/** 기록도 진도도 없을 때의 힌트 — 가운데쯤이어야 위아래 어느 쪽이든 빨리 닿는다. */
export const DEFAULT_START_LEVEL: JlptLevel = "N4";

/**
 * 시작 힌트. 커리큘럼 시작 단계를 먼저, 없으면 지금 수준(`effectiveLevel`)을 쓴다. Pre-N5여도 문제는 N5부터다.
 * 힌트일 뿐이라 틀려도 곧 벗어난다(`priorAround`).
 */
export function pickStartLevel(
  curriculumStart: CurriculumLevelId | null,
  currentLevel: EstimatedLevel | null,
): JlptLevel {
  const level = curriculumStart ?? currentLevel;
  if (level === "Pre-N5") return "N5";
  return level ?? DEFAULT_START_LEVEL;
}

/** 영역을 시작한다. 첫 문제의 급수는 시작 믿음에서 정한다. */
export function startSection(section: MeasuredSection, prior: Distribution): AdaptiveState {
  return { section, prior, level: bestNextLevel(prior), answers: [], done: null };
}

/** 답 하나를 반영한다. "모르겠어요"는 틀린 것과 같다(`correct: false`). */
export function answerSection(state: AdaptiveState, correct: boolean): AdaptiveState {
  if (state.done) return state;
  const answers = [...state.answers, { level: state.level, correct }];
  const belief = posterior(state.prior, answers);

  let done: AdaptiveState["done"] = null;
  if (answers.length >= SECTION_MAX_ITEMS[state.section]) done = "limit";
  else if (answers.length >= SECTION_MIN_ITEMS[state.section] && isSettled(belief)) done = "settled";

  return { ...state, answers, done, level: done ? state.level : bestNextLevel(belief) };
}

/** 지금까지의 믿음 */
export function sectionBelief(state: AdaptiveState): Distribution {
  return posterior(state.prior, state.answers);
}

/** 이 영역의 추정 급수 */
export function estimateSection(state: AdaptiveState): EstimatedLevel {
  return mostLikely(sectionBelief(state));
}

/**
 * 가나 영역을 붙여야 하나 — 어휘가 N5 이하로 끝났으면. N5와 입문은 문자를 아는지로 갈린다.
 */
export function needsKanaSection(vocab: AdaptiveState): boolean {
  if (!vocab.done) return false;
  const estimate = estimateSection(vocab);
  return estimate === "Pre-N5" || estimate === "N5";
}
