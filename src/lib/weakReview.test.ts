import { describe, expect, it } from "vitest";
import type { StudyEvent, StudyEventType } from "./learnerMemoryDb";
import { REVIEW_KANJI_LIMIT, collectReviewTargets } from "./weakReview";

// 틀려도 콘솔은 조용하다 — 다 익힌 단어가 계속 나오거나, 방금 틀린 한자가 빠질 뿐이다.

let clock = 0;
function event(type: StudyEventType, subject: string, extra: Partial<StudyEvent> = {}): StudyEvent {
  clock += 1000;
  return { at: clock, type, subject, ...extra };
}

describe("collectReviewTargets — 한자", () => {
  it("틀린 게 맞힌 것보다 많으면 약하다", () => {
    const t = collectReviewTargets([event("kanji-quiz-wrong", "食"), event("kanji-quiz-wrong", "食"), event("kanji-quiz-correct", "食")]);
    expect(t.kanji).toEqual(["食"]);
  });

  it("전체로는 맞힌 게 많아도 마지막에 틀렸으면 약하다", () => {
    const t = collectReviewTargets([
      event("kanji-quiz-correct", "水"),
      event("kanji-quiz-correct", "水"),
      event("kanji-quiz-wrong", "水"),
    ]);
    expect(t.kanji).toEqual(["水"]);
  });

  it("다시 맞혀서 맞힌 쪽이 많아지면 빠진다", () => {
    const t = collectReviewTargets([
      event("kanji-quiz-wrong", "木"),
      event("kanji-quiz-correct", "木"),
      event("kanji-quiz-correct", "木"),
    ]);
    expect(t.kanji).toEqual([]);
  });

  it("최근에 틀린 것부터, 개수 제한까지", () => {
    const chars = ["一", "二", "三", "四", "五", "六", "七"];
    const t = collectReviewTargets(chars.map((c) => event("kanji-quiz-wrong", c)));
    expect(t.kanji).toHaveLength(REVIEW_KANJI_LIMIT);
    expect(t.kanji[0]).toBe("七");
  });

  it("이벤트 순서를 믿지 않는다(최신이 앞으로 와도 같은 결과)", () => {
    const events = [event("kanji-quiz-correct", "火"), event("kanji-quiz-correct", "火"), event("kanji-quiz-wrong", "火")];
    expect(collectReviewTargets([...events].reverse()).kanji).toEqual(["火"]);
  });
});

describe("collectReviewTargets — 단어", () => {
  it("몰랐던 단어는 나중에 '알아요'를 하면 빠진다", () => {
    const t = collectReviewTargets([event("word-review-unknown", "約束"), event("word-review-known", "約束")]);
    expect(t.words).toEqual([]);
  });

  it("알던 단어도 그 뒤에 다시 모르면 들어온다", () => {
    const t = collectReviewTargets([event("word-review-known", "約束"), event("word-review-unknown", "約束")]);
    expect(t.words.map((w) => w.word)).toEqual(["約束"]);
  });

  it("'모르겠어요'가 '찾아봄'보다 먼저 온다", () => {
    const t = collectReviewTargets([
      event("word-review-unknown", "難しい"),
      event("word-looked-up", "簡単", { detail: "かんたん" }),
    ]);
    expect(t.words.map((w) => w.word)).toEqual(["難しい", "簡単"]);
  });

  it("찾아볼 때 남긴 읽기와 급수를 복습 기록이 지우지 않는다", () => {
    const t = collectReviewTargets([
      event("word-looked-up", "上手", { detail: "じょうず", level: "N5" }),
      event("word-review-unknown", "上手"),
    ]);
    expect(t.words).toEqual([{ word: "上手", reading: "じょうず", level: "N5" }]);
  });

  it("다른 종류의 기록은 세지 않는다", () => {
    const t = collectReviewTargets([event("word-added", "猫"), event("kanji-learned", "猫"), event("teacher-question", "だけ")]);
    expect(t).toEqual({ kanji: [], words: [] });
  });
});
