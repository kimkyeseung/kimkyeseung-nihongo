import { describe, expect, it } from "vitest";
import {
  LEVEL_COMMENT_LEAK_REFERENCE,
  LEVEL_COMMENT_SYSTEM_PROMPT,
  buildLevelCommentPrompt,
  fallbackComment,
  weakestSection,
} from "./comment";
import { NOT_MEASURED, kanaResult, type LevelTestSections } from "./result";
import { REFUSE_PROMPT_DISCLOSURE, looksLikePromptLeak } from "../promptSafety";
import type { SectionResult } from "../../types/levelTest";

// 총평 프롬프트와 출력 가드. 학습자 글자가 섞여 들어가면 인젝션 통로가 되고, 유출 검사 기준이 넓으면
// 시키는 대로 쓴 멀쩡한 총평이 거절 문구로 바뀐다 — 둘 다 화면에서는 조용하다.

const r = (estimate: SectionResult["estimate"], correct = 4, total = 6): SectionResult => ({
  estimate,
  correct,
  total,
  confident: true,
});

const SECTIONS: LevelTestSections = {
  vocab: r("N3", 6, 8),
  kanji: r("N4", 5, 8),
  grammar: r("N3", 6, 8),
  reading: r("N4", 1, 2),
  listening: NOT_MEASURED,
};

describe("buildLevelCommentPrompt — 코드가 만든 값만 들어간다", () => {
  it("영역별 급수·정답 수·측정 안 함을 적는다", () => {
    const prompt = buildLevelCommentPrompt(SECTIONS, "N3", { purpose: null, exam: null });
    expect(prompt).toContain("- 종합: N3");
    expect(prompt).toContain("- 어휘: N3 (8문제 중 6개 정답)");
    expect(prompt).toContain("- 한자: N4 (8문제 중 5개 정답)");
    expect(prompt).toContain("- 청해: 측정 안 함");
  });

  it("버튼으로 고른 목적·시험만 정해진 문구로 넣는다", () => {
    const prompt = buildLevelCommentPrompt(SECTIONS, "N3", { purpose: "travel", exam: { level: "N2", timing: "1y" } });
    expect(prompt).toContain("- 공부 목적: 여행");
    expect(prompt).toContain("- 볼 예정인 시험: JLPT N2, 1년 안");
  });

  it("'기타' 목적은 넣지 않고, 시험이 없으면 없다고 적는다", () => {
    const prompt = buildLevelCommentPrompt(SECTIONS, "N3", { purpose: "other", exam: "none" });
    expect(prompt).not.toContain("공부 목적");
    expect(prompt).toContain("- 볼 예정인 시험: 없음");
  });

  it("입문·가나는 사람이 읽는 말로", () => {
    const prompt = buildLevelCommentPrompt({ vocab: r("Pre-N5"), kana: kanaResult(3, 8) }, "Pre-N5", {
      purpose: null,
      exam: null,
    });
    expect(prompt).toContain("- 종합: 입문(N5 전)");
    expect(prompt).toContain("- 문자: 연습 필요 (8문제 중 3개 정답)");
  });
});

describe("총평 지시문과 유출 가드", () => {
  it("거절 규칙이 붙어 있다", () => {
    expect(LEVEL_COMMENT_SYSTEM_PROMPT).toContain(REFUSE_PROMPT_DISCLOSURE);
  });

  it("지시문을 그대로 옮기면 유출로 잡는다", () => {
    expect(looksLikePromptLeak(LEVEL_COMMENT_SYSTEM_PROMPT, LEVEL_COMMENT_LEAK_REFERENCE)).toBe(true);
  });

  it("시키는 대로 쓴 총평은 유출로 보지 않는다(답변 모양 지시는 검사 기준에서 뺐다)", () => {
    const answer =
      "어휘와 문법이 N3까지 잘 나왔어요. 특히 문법은 8문제 중 6개를 맞혔네요. 가장 약한 영역은 한자예요. " +
      "다음에는 N4 한자부터 단어 속에서 읽는 연습을 해 보세요. 여행 가기 전에 표지판 한자를 읽을 수 있으면 훨씬 편해요.";
    expect(looksLikePromptLeak(answer, LEVEL_COMMENT_LEAK_REFERENCE)).toBe(false);
  });
});

describe("weakestSection", () => {
  it("측정한 영역 중 가장 낮은 급수", () => {
    expect(weakestSection(SECTIONS)).toBe("kanji");
  });

  it("가나를 통과하지 못했으면 가나가 먼저", () => {
    expect(weakestSection({ ...SECTIONS, kana: kanaResult(2, 8) })).toBe("kana");
  });

  it("측정 안 한 영역은 고르지 않는다", () => {
    expect(weakestSection({ listening: NOT_MEASURED, vocab: r("N2") })).toBe("vocab");
    expect(weakestSection({ listening: NOT_MEASURED })).toBeNull();
  });
});

describe("fallbackComment — AI 없이", () => {
  it("종합과 가장 약한 영역, 다음 할 일을 코드가 쓴다", () => {
    const text = fallbackComment(SECTIONS, "N3");
    expect(text).toContain("종합 결과는 N3");
    expect(text).toContain("가장 아쉬운 영역은 한자.");
    expect(text).toContain("한자 페이지");
  });

  it("판정 불가면 다시 해보라고만", () => {
    expect(fallbackComment({}, null)).toContain("한 번 더 진단");
  });
});
