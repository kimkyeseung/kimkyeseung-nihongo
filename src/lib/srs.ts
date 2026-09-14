// 아주 단순화한 SM-2 스타일 간격 반복(SRS) 계산.
// 완벽한 SM-2 구현이 아니라, "안다고 답하면 복습 간격이 점점 늘어나고,
// 모른다고 답하면 다시 짧아진다"는 핵심 아이디어만 가져온 버전이다.
export interface SrsState {
  interval: number; // 다음 복습까지 일수
  easeFactor: number;
  dueAt: number; // 다음 복습 예정 시각(ms)
  reviewCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

export function createInitialSrs(): SrsState {
  return { interval: 0, easeFactor: 2.5, dueAt: Date.now(), reviewCount: 0 };
}

export function reviewSrs(current: SrsState, know: boolean): SrsState {
  if (know) {
    const easeFactor = Math.min(MAX_EASE, current.easeFactor + 0.1);
    const interval = current.reviewCount === 0 ? 1 : Math.round(current.interval * easeFactor);
    return {
      interval,
      easeFactor,
      dueAt: Date.now() + interval * DAY_MS,
      reviewCount: current.reviewCount + 1,
    };
  }
  const easeFactor = Math.max(MIN_EASE, current.easeFactor - 0.2);
  return {
    interval: 1,
    easeFactor,
    dueAt: Date.now() + DAY_MS,
    reviewCount: current.reviewCount + 1,
  };
}
