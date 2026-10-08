import { JLPT_LEVELS, type JlptLevel } from "../../types/jlpt";
import type { CurriculumLevelId } from "../../types/curriculum";
import type {
  AdaptiveState,
  EstimatedLevel,
  LevelTestSection,
  ShortSection,
  StaircaseSection,
} from "../../types/levelTest";

// 레벨 진단의 적응형 출제 — "다음 문제를 어느 급수에서 낼까, 언제 멈출까, 그래서 몇 급인가".
// 전부 조용히 틀리는 계산이다: 계단이 한 칸 어긋나도 문제는 멀쩡히 나오고, 결과 화면에는
// 그럴듯한 급수가 뜨고, 학습자는 그 급수로 커리큘럼을 시작해 버린다. 그래서 상태는 직렬화
// 가능한 순수 값으로 두고 `adaptive.test.ts`가 고정한다.

/** 영역별 문항 상한(시간 예산 합 ≈ 15분 — 구현 프롬프트 4-2). */
export const SECTION_MAX_ITEMS: Record<LevelTestSection, number> = {
  kana: 8,
  vocab: 12,
  kanji: 10,
  grammar: 12,
  reading: 2,
  listening: 3,
};

/** 기록도 진도도 없을 때 시작하는 급수 — 가운데쯤에서 시작해야 위아래 어느 쪽이든 빨리 닿는다. */
export const DEFAULT_START_LEVEL: JlptLevel = "N4";

/** 연속 정답 몇 개면 한 급수 올라가나 */
const STREAK_TO_LEVEL_UP = 2;
/** 방향이 몇 번 바뀌면 경계를 찾은 것으로 보나 */
const REVERSALS_TO_STOP = 3;
/** N5에서 몇 개 연달아 틀리면 멈추나 */
const FLOOR_MISSES_TO_STOP = 2;

const indexOf = (level: JlptLevel) => JLPT_LEVELS.indexOf(level);

/** 한 급수 위(어려운 쪽)/아래. 끝에서는 그대로다. */
function shift(level: JlptLevel, direction: -1 | 1): JlptLevel {
  const next = indexOf(level) + direction;
  return JLPT_LEVELS[Math.min(JLPT_LEVELS.length - 1, Math.max(0, next))];
}

/**
 * 계단식 영역의 시작 급수. 커리큘럼 시작 단계를 먼저, 없으면 기록으로 추정한 수준을 쓴다.
 * 학습자가 직접 고른 단계가 기록 추정보다 믿을 만하다. Pre-N5(문자 단계)를 골랐어도 문제는
 * N5부터 낸다 — 그 아래 급수의 문제는 없다.
 */
export function pickStartLevel(
  curriculumStart: CurriculumLevelId | null,
  levelGuess: JlptLevel | null,
): JlptLevel {
  if (curriculumStart === "Pre-N5") return "N5";
  if (curriculumStart) return curriculumStart;
  return levelGuess ?? DEFAULT_START_LEVEL;
}

function emptyState(section: StaircaseSection | ShortSection, level: JlptLevel): AdaptiveState {
  return { section, level, streak: 0, lastDirection: 0, reversals: 0, floorMisses: 0, answers: [], done: null };
}

/** 계단식 영역(어휘·한자·문법)을 시작한다. */
export function startStaircase(section: StaircaseSection, startLevel: JlptLevel): AdaptiveState {
  return emptyState(section, startLevel);
}

/**
 * 계단식 영역에 답 하나를 반영한다. "모르겠어요"는 틀린 것과 같다(`correct: false`).
 * - 맞힘: 연속 정답이 2가 되면 한 급수 위로(N1이면 그대로).
 * - 틀림: 한 급수 아래로(N5면 그대로).
 * - 실제로 움직였을 때만 방향을 따진다 — N1에서 계속 맞혀도 "방향 전환"이 생기지 않는다.
 */
export function answerStaircase(state: AdaptiveState, correct: boolean): AdaptiveState {
  if (state.done) return state;
  const answers = [...state.answers, { level: state.level, correct }];
  let { level, streak, lastDirection, reversals, floorMisses } = state;

  floorMisses = !correct && state.level === "N5" ? floorMisses + 1 : 0;

  let direction: -1 | 1 | null = null;
  if (correct) {
    streak += 1;
    if (streak >= STREAK_TO_LEVEL_UP) {
      streak = 0;
      if (level !== "N1") direction = 1;
    }
  } else {
    streak = 0;
    if (level !== "N5") direction = -1;
  }

  if (direction !== null) {
    if (lastDirection !== 0 && lastDirection !== direction) reversals += 1;
    lastDirection = direction;
    level = shift(level, direction);
  }

  let done: AdaptiveState["done"] = null;
  if (floorMisses >= FLOOR_MISSES_TO_STOP) done = "floor";
  else if (reversals >= REVERSALS_TO_STOP) done = "reversals";
  else if (answers.length >= SECTION_MAX_ITEMS[state.section]) done = "limit";

  return { ...state, level, streak, lastDirection, reversals, floorMisses, answers, done };
}

/** 급수별 (맞힌 수, 푼 수) */
function tally(state: AdaptiveState): Map<JlptLevel, { correct: number; total: number }> {
  const map = new Map<JlptLevel, { correct: number; total: number }>();
  for (const a of state.answers) {
    const t = map.get(a.level) ?? { correct: 0, total: 0 };
    t.total += 1;
    if (a.correct) t.correct += 1;
    map.set(a.level, t);
  }
  return map;
}

/** 조건을 만족하는 가장 높은 급수. 하나도 없으면 Pre-N5(= N5 미만). */
function highestPassing(
  state: AdaptiveState,
  passes: (t: { correct: number; total: number }) => boolean,
): EstimatedLevel {
  const counts = tally(state);
  for (let i = JLPT_LEVELS.length - 1; i >= 0; i -= 1) {
    const t = counts.get(JLPT_LEVELS[i]);
    if (t && passes(t)) return JLPT_LEVELS[i];
  }
  return "Pre-N5";
}

/**
 * 계단식 영역의 추정 급수 — "그 급수에서 2문항 이상 풀었고 정답률 ≥ 2/3"인 급수 중 가장 높은 것.
 * 한 번 운 좋게 맞힌 높은 급수가 결과가 되지 않도록 2문항을 요구한다. 비교는 정수로 한다
 * (2/3을 소수로 바꾸면 경계값 0.666…에서 부동소수 오차로 떨어질 수 있다).
 */
export function estimateStaircase(state: AdaptiveState): EstimatedLevel {
  return highestPassing(state, (t) => t.total >= 2 && t.correct * 3 >= t.total * 2);
}

/**
 * 경계를 찾았는가 — 아니면 결과에 "조금 더 풀어봐야 정확해요"를 붙인다. 상한까지 갔어도 N1로
 * 추정됐으면 확실한 것으로 본다: 더 올라가 볼 급수가 없어서 방향이 안 바뀐 것뿐이다(N1 문제를
 * 계속 맞힌 사람에게 "부정확할 수 있어요"라고 하면 이상하다).
 */
export function isStaircaseConfident(state: AdaptiveState): boolean {
  return state.done !== "limit" || estimateStaircase(state) === "N1";
}

/**
 * 가나 영역을 붙여야 하나 — 어휘가 N5에서 끝났거나(문제를 더 낼 급수가 N5였다), N5 정답률이
 * 1/2 미만이면. N5 문제를 하나도 안 풀었으면 정답률로는 판단하지 않는다.
 */
export function needsKanaSection(vocab: AdaptiveState): boolean {
  if (!vocab.done) return false;
  if (vocab.done === "floor" || vocab.level === "N5") return true;
  const n5 = tally(vocab).get("N5");
  return !!n5 && n5.correct * 2 < n5.total;
}

/**
 * 독해·청해의 시작 급수 — 문법·어휘 추정치 중 **낮은 쪽**. 지문을 읽으려면 둘 다 있어야 해서
 * 높은 쪽에서 시작하면 첫 문제부터 손을 못 댄다. 측정 못 한 쪽(null)은 빼고 보고 — N5로 치면
 * 다른 쪽이 N2여도 N5부터 낸다 — 둘 다 없거나 Pre-N5면 N5.
 */
export function shortSectionStartLevel(
  grammar: EstimatedLevel | null,
  vocab: EstimatedLevel | null,
): JlptLevel {
  const known = [grammar, vocab]
    .filter((e): e is EstimatedLevel => e !== null)
    .map((e): JlptLevel => (e === "Pre-N5" ? "N5" : e));
  if (known.length === 0) return "N5";
  return known.reduce((low, l) => (indexOf(l) < indexOf(low) ? l : low));
}

/** 독해·청해를 시작한다. */
export function startShortSection(section: ShortSection, startLevel: JlptLevel): AdaptiveState {
  return emptyState(section, startLevel);
}

/** 독해·청해에 답 하나를 반영한다 — 맞히면 한 급수 위, 틀리면 한 급수 아래 문제를 하나 더. */
export function answerShortSection(state: AdaptiveState, correct: boolean): AdaptiveState {
  if (state.done) return state;
  const answers = [...state.answers, { level: state.level, correct }];
  const done = answers.length >= SECTION_MAX_ITEMS[state.section] ? "limit" : null;
  return { ...state, answers, level: shift(state.level, correct ? 1 : -1), done };
}

/**
 * 독해·청해의 추정 급수 — 문항이 적으니 기준을 "그 급수에서 푼 문항의 절반 이상"으로 낮춘다.
 * 상한이 2~3문항이라 계단식처럼 경계를 찾았는지 따지지 않는다(항상 "limit"로 끝난다).
 */
export function estimateShortSection(state: AdaptiveState): EstimatedLevel {
  return highestPassing(state, (t) => t.total >= 1 && t.correct * 2 >= t.total);
}
