import { CURRICULUM_LEVELS } from "../../types/curriculum";
import type {
  AdaptiveState,
  EstimatedLevel,
  LevelTestSection,
  SectionResult,
} from "../../types/levelTest";
import { sectionBelief } from "./adaptive";
import { combineEvidence, evidenceOf, likelyRange, mostLikely, normalize, type Distribution } from "./inference";

// 레벨 진단의 종합 판정. 결과가 곧 커리큘럼 시작 단계가 되므로 조용히 틀리면 학습자가 엉뚱한
// 단계에서 시작한다(화면에는 그럴듯한 급수가 뜬다). `result.test.ts`가 고정한다.

export type LevelTestSections = Partial<Record<LevelTestSection, SectionResult>>;

/** 영역 순서(결과 화면·요약 문구가 같은 순서를 쓴다). 가나는 조건부라 맨 앞에 두되 없을 수 있다. */
export const SECTION_ORDER: LevelTestSection[] = ["kana", "vocab", "kanji", "grammar", "reading", "listening"];

/** 측정하지 않은 영역(청해에 쓸 음성이 없을 때 등). 0점이 아니다 — 종합에서 아예 뺀다. */
export const NOT_MEASURED: SectionResult = { estimate: null, correct: 0, total: 0, confident: true };

const correctCount = (state: AdaptiveState) => state.answers.filter((a) => a.correct).length;

const rank = (level: EstimatedLevel) => CURRICULUM_LEVELS.indexOf(level);

export function sectionResult(state: AdaptiveState): SectionResult {
  const belief = sectionBelief(state);
  const { low, high } = likelyRange(belief);
  return {
    estimate: mostLikely(belief),
    correct: correctCount(state),
    total: state.answers.length,
    confident: state.done === "settled" || rank(high) - rank(low) <= 1,
    low,
    high,
    evidence: evidenceOf(state.answers),
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

/** 답별 근거가 없는 결과(저장된 요약 등)는 추정 급수에 무게를 둔 근거로 친다. */
function evidenceFromEstimate(estimate: EstimatedLevel): Distribution {
  return normalize(CURRICULUM_LEVELS.map((_, i) => 0.4 ** Math.abs(i - rank(estimate))));
}

/** 측정한 영역(가나 제외)의 근거를 무게대로 합친 믿음. 측정한 영역이 없으면 null. */
export function overallBelief(sections: LevelTestSections): Distribution | null {
  const evidence: Partial<Record<LevelTestSection, Distribution>> = {};
  for (const s of SECTION_ORDER) {
    const r = sections[s];
    if (s === "kana" || !r?.estimate) continue;
    evidence[s] = r.evidence ?? evidenceFromEstimate(r.estimate);
  }
  return combineEvidence(evidence);
}

/**
 * 종합 급수 — **영역별 급수의 중앙값이 아니라 모든 답의 근거를 합친 결과다.** 중앙값은 어느 영역에서 몇 문제를
 * 어떻게 풀었는지를 버려서, 5/6으로 N5인 영역과 1/3으로 N5인 영역을 같게 봤다. 문장을 읽을 수 있는지가 시작
 * 단계를 정하므로 어휘·한자는 무게를 낮춘다(`OVERALL_WEIGHT`).
 * - 가나 영역을 풀었는데 통과하지 못했으면 Pre-N5 — 문자부터다.
 * - 측정한 영역이 하나도 없으면 null(판정 불가).
 */
export function overallLevel(sections: LevelTestSections): EstimatedLevel | null {
  if (sections.kana?.estimate === "Pre-N5") return "Pre-N5";
  const belief = overallBelief(sections);
  return belief ? mostLikely(belief) : (sections.kana?.estimate ?? null);
}

/** 종합의 범위(가능성 80%). 하나로 좁혀졌거나 판정할 수 없으면 null — 화면에 "N5~N4 사이"로 보여 준다. */
export function overallRange(sections: LevelTestSections): { low: EstimatedLevel; high: EstimatedLevel } | null {
  if (sections.kana?.estimate === "Pre-N5") return null;
  const belief = overallBelief(sections);
  if (!belief) return null;
  const range = likelyRange(belief);
  return range.low === range.high ? null : range;
}

/** 경계를 못 찾은 영역 — 결과 화면에 "이 영역은 조금 더 풀어봐야 정확해요"를 붙인다. */
export function lowConfidenceSections(sections: LevelTestSections): LevelTestSection[] {
  return SECTION_ORDER.filter((s) => {
    const r = sections[s];
    return r != null && r.estimate != null && !r.confident;
  });
}
