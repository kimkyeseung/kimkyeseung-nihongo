import { CURRICULUM_LEVELS } from "../../types/curriculum";
import type {
  AdaptiveState,
  EstimatedLevel,
  LevelTestSection,
  SectionResult,
} from "../../types/levelTest";
import { estimateShortSection, estimateStaircase, isStaircaseConfident } from "./adaptive";

// 레벨 진단의 종합 판정. 결과가 곧 커리큘럼 시작 단계가 되므로 조용히 틀리면 학습자가 엉뚱한
// 단계에서 시작한다(화면에는 그럴듯한 급수가 뜬다). `result.test.ts`가 고정한다.

export type LevelTestSections = Partial<Record<LevelTestSection, SectionResult>>;

/** 영역 순서(결과 화면·요약 문구가 같은 순서를 쓴다). 가나는 조건부라 맨 앞에 두되 없을 수 있다. */
export const SECTION_ORDER: LevelTestSection[] = ["kana", "vocab", "kanji", "grammar", "reading", "listening"];

/** 측정하지 않은 영역(청해에 쓸 음성이 없을 때 등). 0점이 아니다 — 종합에서 아예 뺀다. */
export const NOT_MEASURED: SectionResult = { estimate: null, correct: 0, total: 0, confident: true };

const correctCount = (state: AdaptiveState) => state.answers.filter((a) => a.correct).length;

export function staircaseResult(state: AdaptiveState): SectionResult {
  return {
    estimate: estimateStaircase(state),
    correct: correctCount(state),
    total: state.answers.length,
    confident: isStaircaseConfident(state),
  };
}

export function shortSectionResult(state: AdaptiveState): SectionResult {
  return {
    estimate: estimateShortSection(state),
    correct: correctCount(state),
    total: state.answers.length,
    confident: true,
  };
}

/**
 * 가나 영역 결과. JLPT 급수가 아니므로 통과면 "N5"(문자는 됐다), 아니면 "Pre-N5"로 적는다.
 * 통과 기준은 3/4 — 가나는 다음 모든 영역의 바탕이라 반쯤 아는 것으로는 부족하다.
 */
export function kanaResult(correct: number, total: number): SectionResult {
  const passed = total > 0 && correct * 4 >= total * 3;
  return { estimate: passed ? "N5" : "Pre-N5", correct, total, confident: true };
}

const rank = (level: EstimatedLevel) => CURRICULUM_LEVELS.indexOf(level);

/**
 * 종합 급수.
 * - 측정한 영역(가나 제외) 추정치의 **중앙값**. 짝수 개면 낮은 쪽 — 높게 잡아 어려운 단계에서
 *   시작하는 쪽이 낮게 잡는 쪽보다 손해가 크다.
 * - 가장 낮은 영역이 중앙값보다 2단계 이상 낮으면 한 단계 내린다. JLPT는 모든 영역이 기준점을
 *   넘어야 합격이라, 한 영역이 크게 비면 그 급수는 위험하다.
 * - 가나 영역을 풀었는데 통과하지 못했으면 Pre-N5 — 문자부터다.
 * - 측정한 영역이 하나도 없으면 null(판정 불가).
 */
export function overallLevel(sections: LevelTestSections): EstimatedLevel | null {
  if (sections.kana?.estimate === "Pre-N5") return "Pre-N5";

  const ranks = SECTION_ORDER.filter((s) => s !== "kana")
    .map((s) => sections[s]?.estimate)
    .filter((e): e is EstimatedLevel => e != null)
    .map(rank)
    .sort((a, b) => a - b);
  if (ranks.length === 0) return sections.kana?.estimate ?? null;

  let overall = ranks[Math.floor((ranks.length - 1) / 2)];
  if (overall - ranks[0] >= 2) overall -= 1;
  return CURRICULUM_LEVELS[overall];
}

/** 경계를 못 찾은 영역 — 결과 화면에 "이 영역은 조금 더 풀어봐야 정확해요"를 붙인다. */
export function lowConfidenceSections(sections: LevelTestSections): LevelTestSection[] {
  return SECTION_ORDER.filter((s) => {
    const r = sections[s];
    return r != null && r.estimate != null && !r.confident;
  });
}
