import { describe, expect, it } from "vitest";
import { parseExampleResponse } from "./wordExamples";

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
