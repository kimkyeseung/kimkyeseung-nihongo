import { CURRICULUM_LEVELS } from "../../types/curriculum";
import { JLPT_LEVELS, type JlptLevel } from "../../types/jlpt";
import type { AdaptiveAnswer, EstimatedLevel, LevelTestSection } from "../../types/levelTest";

// 레벨 진단의 판정 — 답 하나마다 "이 학습자가 각 급수일 가능성"을 갱신한다.
//
// 맞고 틀림으로 한 칸씩 오르내리면 끝난 뒤에 "어느 급수에서 2/3을 넘었나"밖에 남지 않아서, 다 맞혀도 상한에
// 걸리고(독해 2/2 → N4) 영역끼리 근거를 합칠 수도 없었다. 여기서는 모든 답을 근거로 쌓고, 가장 많이 알려 줄
// 급수의 문제를 다음에 내고, 충분히 확실해지면 멈춘다. **모델(LLM)을 쓰지 않는 산수다.**
//
// 아래 확률은 **실제 응답으로 맞춘 값이 아니다**(그런 데이터가 없다). 가상 학습자로만 확인했다(simulation.test.ts).

/** 판정 후보 — 입문(Pre-N5)부터 N1까지. 배열 순서 = 쉬운 쪽부터. */
export const LEVEL_COUNT = CURRICULUM_LEVELS.length;

const levelIndex = (level: EstimatedLevel) => CURRICULUM_LEVELS.indexOf(level);

/** 실력이 `true` 급수인 학습자가 `item` 급수 문제를 맞힐 확률. 거리(문제가 얼마나 어려운가)만 본다. */
function correctChance(trueIndex: number, itemIndex: number): number {
  const distance = itemIndex - trueIndex;
  if (distance <= -2) return 0.95;
  if (distance === -1) return 0.9;
  if (distance === 0) return 0.75;
  if (distance === 1) return 0.38;
  if (distance === 2) return 0.2;
  return 0.12; // 찍어서 맞히는 정도
}

export type Distribution = number[];

export function normalize(values: readonly number[]): Distribution {
  const sum = values.reduce((a, b) => a + b, 0);
  return sum > 0 ? values.map((v) => v / sum) : values.map(() => 1 / values.length);
}

/** 답 하나의 근거를 곱한다. */
function update(distribution: readonly number[], itemIndex: number, correct: boolean): Distribution {
  return normalize(
    distribution.map((p, t) => {
      const chance = correctChance(t, itemIndex);
      return p * (correct ? chance : 1 - chance);
    })
  );
}

/** 첫 문제 전의 믿음. 시작 급수는 **힌트일 뿐이다** — 자기 수준을 잘못 고른 사람이 거기 붙잡히면 안 된다. */
export function priorAround(level: JlptLevel): Distribution {
  const center = levelIndex(level);
  return normalize(CURRICULUM_LEVELS.map((_, i) => Math.exp(-0.35 * Math.abs(i - center))));
}

/**
 * 앞 영역에서 알게 된 것을 다음 영역의 시작 믿음으로. 영역마다 실력이 다를 수 있어 반쯤만 믿는다 — 어휘 N1이
 * 곧 독해 N1은 아니지만, N5 지문부터 차례로 다시 물을 이유도 없다.
 */
export function priorFromEarlier(earlier: readonly number[]): Distribution {
  return normalize(earlier.map((p) => 0.5 * p + 0.5 / LEVEL_COUNT));
}

/** 이 답들을 다 반영한 믿음. */
export function posterior(prior: readonly number[], answers: readonly AdaptiveAnswer[]): Distribution {
  return answers.reduce<Distribution>(
    (current, a) => update(current, levelIndex(a.level), a.correct),
    [...prior]
  );
}

function entropy(distribution: readonly number[]): number {
  return -distribution.reduce((sum, p) => (p > 0 ? sum + p * Math.log(p) : sum), 0);
}

/**
 * 다음 문제의 급수 — 풀고 나면 불확실함이 가장 많이 줄어들 급수. 이미 쉽다고 아는 급수나 어차피 못 풀 급수를
 * 내지 않으므로, 영역마다 문제 수가 적어도 경계로 빨리 간다. 같으면 쉬운 쪽.
 *
 * **가장 그럴듯한 급수의 ±1 안에서만 고른다.** 계산만 따르면 앞 영역을 다 틀린 입문자에게 N3 지문을 냈다 — 판정에는
 * 도움이 되어도 처음 온 사람은 거기서 그만둔다.
 */
export function bestNextLevel(distribution: readonly number[]): JlptLevel {
  const center = levelIndex(mostLikely(distribution));
  let best: JlptLevel = JLPT_LEVELS[Math.max(0, center - 1)];
  let bestEntropy = Infinity;
  for (const level of JLPT_LEVELS) {
    const item = levelIndex(level);
    if (Math.abs(item - center) > 1) continue;
    const chance = distribution.reduce((sum, p, t) => sum + p * correctChance(t, item), 0);
    const expected =
      chance * entropy(update(distribution, item, true)) + (1 - chance) * entropy(update(distribution, item, false));
    if (expected < bestEntropy - 1e-9) {
      bestEntropy = expected;
      best = level;
    }
  }
  return best;
}

/** 가장 그럴듯한 급수. 같으면 낮은 쪽 — 어려운 단계에서 시작하는 쪽이 손해가 크다. */
export function mostLikely(distribution: readonly number[]): EstimatedLevel {
  let best = 0;
  distribution.forEach((p, i) => {
    if (p > distribution[best] + 1e-9) best = i;
  });
  return CURRICULUM_LEVELS[best];
}

/** 이어진 급수 범위 중 가능성이 80%를 넘는 가장 좁은 것 — 결과에 "N4~N3"으로 솔직하게 보여 준다. */
export function likelyRange(distribution: readonly number[], mass = 0.8): { low: EstimatedLevel; high: EstimatedLevel } {
  let low = levelIndex(mostLikely(distribution));
  let high = low;
  let sum = distribution[low];
  while (sum < mass && (low > 0 || high < distribution.length - 1)) {
    const below = low > 0 ? distribution[low - 1] : -1;
    const above = high < distribution.length - 1 ? distribution[high + 1] : -1;
    if (below >= above) {
      low -= 1;
      sum += below;
    } else {
      high += 1;
      sum += above;
    }
  }
  return { low: CURRICULUM_LEVELS[low], high: CURRICULUM_LEVELS[high] };
}

/** 이만큼 확실해지면 그 영역을 끝낸다. */
export const SETTLED_CONFIDENCE = 0.8;

export function isSettled(distribution: readonly number[]): boolean {
  return Math.max(...distribution) >= SETTLED_CONFIDENCE;
}

/**
 * 영역별 무게. **어휘를 낮게 친다** — 후리가나가 달리고 한국어와 소리가 비슷한 한자어가 많아, 학습자가 어휘만
 * N1로 나오고 문법은 N5인 일이 실제로 있었다(動物園 → 동물원). 시작 단계는 문장을 읽을 수 있는지로 정해야 한다.
 */
export const OVERALL_WEIGHT: Partial<Record<LevelTestSection, number>> = {
  vocab: 0.5,
  kanji: 0.7,
  grammar: 1,
  reading: 1,
  listening: 0.8,
};

/** 영역별 믿음(시작 믿음을 뺀 순수한 답의 근거)을 무게대로 합친다. */
export function combineEvidence(evidence: Partial<Record<LevelTestSection, readonly number[]>>): Distribution | null {
  const sections = (Object.keys(evidence) as LevelTestSection[]).filter((s) => evidence[s]);
  if (sections.length === 0) return null;
  const logs = new Array<number>(LEVEL_COUNT).fill(0);
  for (const s of sections) {
    const weight = OVERALL_WEIGHT[s] ?? 1;
    evidence[s]!.forEach((p, i) => {
      logs[i] += weight * Math.log(Math.max(p, 1e-9));
    });
  }
  const top = Math.max(...logs);
  return normalize(logs.map((l) => Math.exp(l - top)));
}

/** 시작 믿음 없이 답만으로 만든 근거 — 힌트가 종합 판정에 두 번 들어가지 않게 한다. */
export function evidenceOf(answers: readonly AdaptiveAnswer[]): Distribution {
  return posterior(new Array<number>(LEVEL_COUNT).fill(1 / LEVEL_COUNT), answers);
}
