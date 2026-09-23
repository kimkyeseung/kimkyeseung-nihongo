import { describe, expect, it } from "vitest";
import {
  buildReviewQueue,
  createInitialSrs,
  formatDueIn,
  nextDueAt,
  planReviewOutcome,
  reviewSrs,
  type SrsState,
} from "./srs";

// 복습 일정은 조용히 틀리는 자리다 — 어긋나도 카드는 멀쩡히 넘어가고, 30일 뒤에 볼 단어가
// 매일 나오거나(예전 동작) 모르는 단어가 한 달 뒤로 밀려도 콘솔에는 아무것도 안 찍힌다.

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function srs(dueAt: number, extra: Partial<SrsState> = {}): SrsState {
  return { interval: 1, easeFactor: 2.5, dueAt, reviewCount: 1, ...extra };
}

describe("buildReviewQueue", () => {
  const entries = [
    { wordId: "later", srs: srs(NOW + 30 * DAY) },
    { wordId: "today", srs: srs(NOW) },
    { wordId: "overdue", srs: srs(NOW - 3 * DAY) },
  ];

  it("때가 된 단어만, 오래 밀린 것부터 넣는다", () => {
    expect(buildReviewQueue(entries, NOW)).toEqual(["overdue", "today"]);
  });

  it("30일 뒤로 밀린 단어는 오늘 세트에 없다", () => {
    expect(buildReviewQueue(entries, NOW)).not.toContain("later");
  });

  it("더 복습하기는 전부 넣되 순서는 그대로다", () => {
    expect(buildReviewQueue(entries, NOW, { includeNotDue: true })).toEqual([
      "overdue",
      "today",
      "later",
    ]);
  });

  it("방금 담은 단어는 바로 복습 대상이다", () => {
    const fresh = createInitialSrs();
    expect(buildReviewQueue([{ wordId: "new", srs: fresh }], fresh.dueAt)).toEqual(["new"]);
  });
});

describe("nextDueAt", () => {
  it("때가 안 된 것 중 가장 빠른 시각", () => {
    expect(
      nextDueAt([{ srs: srs(NOW - DAY) }, { srs: srs(NOW + 5 * DAY) }, { srs: srs(NOW + 2 * DAY) }], NOW)
    ).toBe(NOW + 2 * DAY);
  });

  it("전부 때가 됐거나 비었으면 null", () => {
    expect(nextDueAt([{ srs: srs(NOW) }], NOW)).toBeNull();
    expect(nextDueAt([], NOW)).toBeNull();
  });
});

describe("planReviewOutcome", () => {
  it("때가 된 단어는 안다/모른다 모두 SRS·XP에 반영한다", () => {
    expect(planReviewOutcome(srs(NOW), true, NOW)).toEqual({ updateSrs: true, grantXp: true });
    // 모른다고 답해도 XP를 준다 — 안 주면 솔직하게 답할 이유가 없다.
    expect(planReviewOutcome(srs(NOW), false, NOW)).toEqual({ updateSrs: true, grantXp: true });
  });

  it("때가 안 된 단어의 '안다'는 간격을 늘리지 않고 XP도 없다", () => {
    expect(planReviewOutcome(srs(NOW + DAY), true, NOW)).toEqual({
      updateSrs: false,
      grantXp: false,
    });
  });

  it("때가 안 된 단어라도 '모른다'는 SRS에 반영한다", () => {
    expect(planReviewOutcome(srs(NOW + DAY), false, NOW)).toEqual({
      updateSrs: true,
      grantXp: false,
    });
  });
});

describe("reviewSrs", () => {
  it("안다: 간격이 늘어난다", () => {
    const next = reviewSrs(srs(NOW, { interval: 4 }), true);
    expect(next.interval).toBeGreaterThan(4);
  });

  it("모른다: 간격이 하루로 돌아가고 쉬움 계수가 내려간다", () => {
    const next = reviewSrs(srs(NOW, { interval: 20, easeFactor: 2.5 }), false);
    expect(next.interval).toBe(1);
    expect(next.easeFactor).toBeLessThan(2.5);
  });
});

describe("formatDueIn", () => {
  it("하루 안쪽은 시간으로", () => {
    expect(formatDueIn(NOW + 90 * 60 * 1000, NOW)).toBe("2시간 뒤");
  });

  it("하루는 내일, 그 이상은 일수로", () => {
    expect(formatDueIn(NOW + DAY, NOW)).toBe("내일");
    expect(formatDueIn(NOW + 3 * DAY, NOW)).toBe("3일 뒤");
  });

  it("이미 지났으면 지금", () => {
    expect(formatDueIn(NOW - 1, NOW)).toBe("지금");
  });
});
