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

/** 복습할 때가 된 단어인가. 새로 담은 단어는 `dueAt`이 담은 시각이라 바로 해당한다. */
export function isDue(srs: SrsState, now: number): boolean {
  return srs.dueAt <= now;
}

/**
 * 복습 세트에 넣을 단어 id 목록(오래 밀린 것부터).
 *
 * **기본은 복습할 때가 된 단어만이다.** 예전엔 전체를 `dueAt` 순으로 정렬만 해서 넣었기
 * 때문에, 어제 "안다"고 해서 30일 뒤로 밀린 단어도 오늘 세트에 그대로 나왔다 — 간격 계산이
 * 순서에만 쓰이고 "언제 다시 볼지"에는 아무 영향이 없었다(콘솔은 조용하다).
 * `includeNotDue`는 "그래도 더 복습하기"용이다.
 */
export function buildReviewQueue(
  entries: { wordId: string; srs: SrsState }[],
  now: number,
  { includeNotDue = false }: { includeNotDue?: boolean } = {}
): string[] {
  return entries
    .filter((e) => includeNotDue || isDue(e.srs, now))
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
    .map((e) => e.wordId);
}

/** 아직 때가 안 된 단어 중 가장 빠른 복습 시각. 없으면 null. */
export function nextDueAt(entries: { srs: SrsState }[], now: number): number | null {
  let next: number | null = null;
  for (const e of entries) {
    if (isDue(e.srs, now)) continue;
    if (next === null || e.srs.dueAt < next) next = e.srs.dueAt;
  }
  return next;
}

/**
 * 스와이프 한 번을 어디에 반영할지.
 *
 * - **SRS**: 때가 된 단어는 양쪽 다 반영한다. 때가 안 된 단어("더 복습하기")에서 "안다"는
 *   반영하지 않는다 — 앞당겨 본 것을 성공으로 치면 간격이 곱절로 불어나 일정이 무너진다.
 *   "모른다"는 언제든 반영한다 — 잊었다는 건 때와 상관없이 진짜 신호다.
 * - **XP**: 때가 된 단어에만, **안다/모른다 상관없이** 준다. "안다"에만 주면 솔직하게
 *   모른다고 답할 이유가 없어지고, 때가 안 된 단어에 주면 "더 복습하기"로 무한히 쌓인다.
 */
export function planReviewOutcome(
  srs: SrsState,
  know: boolean,
  now: number
): { updateSrs: boolean; grantXp: boolean } {
  const due = isDue(srs, now);
  return { updateSrs: due || !know, grantXp: due };
}

/** "다음 복습" 안내 문구. 간격은 복습한 시각에서 잰 것이라 시간 단위까지만 말한다. */
export function formatDueIn(dueAt: number, now: number): string {
  const diff = dueAt - now;
  if (diff <= 0) return "지금";
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}시간 뒤`;
  const days = Math.round(diff / DAY_MS);
  return days === 1 ? "내일" : `${days}일 뒤`;
}
