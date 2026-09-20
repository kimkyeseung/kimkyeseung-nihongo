import { describe, expect, it } from "vitest";
import type { WordEntry } from "../types/dictionary";
import { buildExamplePrompt, buildRewritePrompt, parseExampleResponse } from "./wordExamples";

/** 뜻이 여러 개인 표제어 — 예문이 어느 뜻으로 나오는지가 이 테스트의 전부다. */
const KAKERU: WordEntry = {
  id: "1207610",
  word: "掛ける",
  reading: "かける",
  jlptLevel: "N4",
  common: true,
  furigana: null,
  pos: ["v1", "vt"],
  meaning: "to hang",
  senses: [
    { pos: ["v1", "vt"], glosses: ["to hang up (e.g. a coat)"] },
    { pos: ["v1", "vt"], glosses: ["to make (a call)"] },
  ],
};

describe("parseExampleResponse", () => {
  it("모델이 붙인 마크다운 강조를 떼어낸다", () => {
    // 예문은 마크다운으로 렌더링되지 않는다(ClickableSentence가 원문 그대로 그린다).
    // 그래서 별표가 화면에 그대로 보였고, `**氏名**`가 한 덩어리로 분절돼 눌러도 반응이 없었다.
    const [ex] = parseExampleResponse(
      "### 예문\n本人確認のため、**氏名**を記入してください。\n### 번역\n본인 확인을 위해 **성명**을 기재해 주십시오."
    );
    expect(ex.japanese).toBe("本人確認のため、氏名を記入してください。");
    expect(ex.korean).toBe("본인 확인을 위해 성명을 기재해 주십시오.");
  });

  it("형식을 못 지킨 응답도 강조는 떼고 통째로 넘긴다", () => {
    const [ex] = parseExampleResponse("**水**を飲みます。");
    expect(ex.japanese).toBe("水を飲みます。");
  });

  it("정상 예문은 그대로 둔다", () => {
    const [ex] = parseExampleResponse("### 예문\n水を飲みます。\n### 번역\n물을 마십니다.");
    expect(ex.japanese).toBe("水を飲みます。");
    expect(ex.korean).toBe("물을 마십니다.");
  });
});

/**
 * 흔한 뜻(앉다)에 가려 두 번째 뜻이 안 나오던 실제 단어. 자동사라 목적어를 못 받는데
 * 모델이 「その役を座っています」라는 비문을 내놨다.
 */
const SUWARU: WordEntry = {
  id: "1291140",
  word: "座る",
  reading: "すわる",
  jlptLevel: "N5",
  common: true,
  furigana: null,
  pos: ["v5r", "vi"],
  meaning: "to sit",
  senses: [
    { pos: ["v5r", "vi"], glosses: ["to sit (down)", "to have a seat"] },
    { pos: ["v5r", "vi"], glosses: ["to assume (a position)", "to take on (a duty)"] },
  ],
};

describe("buildExamplePrompt", () => {
  // 뜻을 잘못 집어도 콘솔은 조용하고, 학습자가 방금 읽은 뜻과 상관없는 예문만 나온다.
  it("고른 뜻은 ✅로, 나머지 뜻은 ❌로 넘긴다", () => {
    const prompt = buildExamplePrompt(KAKERU, 1);
    expect(prompt).toContain("✅ 이 뜻으로만 예문을 만드세요: to make (a call)");
    expect(prompt).toContain("❌ 이 뜻으로는 만들지 마세요: to hang up (e.g. a coat)");
  });

  it("표제어와 읽기를 함께 넘긴다", () => {
    expect(buildExamplePrompt(KAKERU, 0)).toContain("掛ける(かける)");
  });

  // 안 되는 뜻을 안 보여주면 모델이 아는 가장 흔한 뜻으로 돌아간다(座る → "앉다").
  it("흔한 뜻을 ❌ 목록에 넣어 흔한 뜻으로 빠지는 걸 막는다", () => {
    const prompt = buildExamplePrompt(SUWARU, 1);
    expect(prompt).toContain("✅ 이 뜻으로만 예문을 만드세요: to assume (a position)");
    expect(prompt).toContain("❌ 이 뜻으로는 만들지 마세요: to sit (down)");
    expect(prompt).toContain("가장 흔한 뜻이 아니더라도");
  });

  // 자/타동사는 사전이 아는 사실이라 코드가 넘긴다 — 안 넘겼더니 「役を座る」가 나왔다.
  it("자동사면 を를 쓰지 말라고 못박는다", () => {
    expect(buildExamplePrompt(SUWARU, 0)).toContain("座る는 자동사입니다");
  });

  it("타동사에는 を 제한을 붙이지 않는다", () => {
    // 掛ける는 vt라 목적어를 받는다. 여기에 같은 문구가 붙으면 멀쩡한 예문을 막는다.
    expect(buildExamplePrompt(KAKERU, 0)).not.toContain("자동사입니다");
  });

  it("뜻이 하나뿐이면 ❌ 줄을 아예 넣지 않는다", () => {
    const single: WordEntry = { ...KAKERU, senses: [KAKERU.senses[0]] };
    expect(buildExamplePrompt(single, 0)).not.toContain("❌");
  });
});

describe("buildRewritePrompt", () => {
  const source = { japanese: "りんごを食べました。", korean: "사과를 먹었습니다." };

  // 원문이 안 들어가면 모델은 "그냥 어려운 문장 하나"를 만든다 — 내용이 이어지지 않으니
  // 이 버튼이 하려던 일(같은 내용이 어떻게 복잡해지는지 보여주기)이 통째로 사라진다.
  it("바꿀 원문과 표제어를 프롬프트에 넣는다", () => {
    const prompt = buildRewritePrompt(KAKERU, source, "harder");
    expect(prompt).toContain("りんごを食べました。");
    expect(prompt).toContain("掛ける는 반드시 그대로 쓰세요");
  });

  it("방향에 따라 목표 급수가 반대로 움직인다", () => {
    // N4 기준: 쉽게 -> N5, 어렵게 -> N3
    expect(buildRewritePrompt(KAKERU, source, "easier")).toContain("N5");
    expect(buildRewritePrompt(KAKERU, source, "harder")).toContain("N3");
  });

  it("예문을 하나만 요구한다", () => {
    const prompt = buildRewritePrompt(KAKERU, source, "easier");
    expect(prompt).toContain("한 번만");
    expect(prompt).not.toContain("3번 반복");
  });
});
