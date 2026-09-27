import { describe, expect, it } from "vitest";
import { cleanTranslation, findExampleTranslation, sentenceSrs } from "./sentenceReview";

describe("sentenceSrs", () => {
  it("SRS가 없는 옛 문장은 담은 시각에 바로 복습할 새 카드다", () => {
    expect(sentenceSrs({ addedAt: 1000 })).toEqual({ interval: 0, easeFactor: 2.5, dueAt: 1000, reviewCount: 0 });
  });

  it("저장된 SRS가 있으면 그대로 쓴다", () => {
    const srs = { interval: 3, easeFactor: 2.6, dueAt: 5000, reviewCount: 2 };
    expect(sentenceSrs({ addedAt: 1000, srs })).toBe(srs);
  });
});

describe("cleanTranslation", () => {
  it("이탤릭·괄호·구분 기호를 벗긴다", () => {
    expect(cleanTranslation("*(물을 마셨습니다.)*")).toBe("물을 마셨습니다.");
    expect(cleanTranslation("— 어디에 있었어?")).toBe("어디에 있었어?");
    expect(cleanTranslation("（오늘은 덥다）")).toBe("오늘은 덥다");
    expect(cleanTranslation("\"안녕하세요\"")).toBe("안녕하세요");
  });

  it("한글이 없거나 가나가 섞이면 번역이 아니다", () => {
    expect(cleanTranslation("(Where were you?)")).toBeNull();
    expect(cleanTranslation("(여기서 は는 주제)")).toBeNull();
    expect(cleanTranslation("")).toBeNull();
    expect(cleanTranslation(undefined)).toBeNull();
  });
});

describe("findExampleTranslation", () => {
  it("선생님 프롬프트 형식 — 다음 줄의 이탤릭 괄호", () => {
    const md = "예문을 볼게요.\n\n`水を飲みました。`\n*(물을 마셨습니다.)*\n\n다음은…";
    expect(findExampleTranslation(md, "水を飲みました。")).toBe("물을 마셨습니다.");
  });

  it("목록 안의 예문과 번역", () => {
    const md = "- `どこにいたの？`\n- *(어디에 있었어?)*";
    expect(findExampleTranslation(md, "どこにいたの？")).toBe("어디에 있었어?");
  });

  it("같은 줄 뒤에 붙은 번역", () => {
    expect(findExampleTranslation("`雨が降っています。` — 비가 오고 있습니다.", "雨が降っています。")).toBe(
      "비가 오고 있습니다."
    );
    expect(findExampleTranslation("`雨が降っています。` (비가 오고 있습니다.)", "雨が降っています。")).toBe(
      "비가 오고 있습니다."
    );
  });

  it("다음 줄이 설명이면 번역으로 집지 않는다", () => {
    const md = "`水を飲みました。`\n여기서 を는 목적어를 나타내요.";
    expect(findExampleTranslation(md, "水を飲みました。")).toBeNull();
    const partial = "`水を飲みました。`\n*여기서* 는 과거형이에요.";
    expect(findExampleTranslation(partial, "水を飲みました。")).toBeNull();
  });

  it("같은 줄에 조사로 이어지는 설명은 번역이 아니다", () => {
    const md = "`食べました`는 과거형이에요.\n*(먹었습니다)*";
    expect(findExampleTranslation(md, "食べました")).toBeNull();
  });

  it("다음 줄이 또 다른 예문이면 번역이 아니다", () => {
    const md = "`水を飲みました。`\n`お茶を飲みました。`\n*(차를 마셨습니다.)*";
    expect(findExampleTranslation(md, "水を飲みました。")).toBeNull();
    expect(findExampleTranslation(md, "お茶を飲みました。")).toBe("차를 마셨습니다.");
  });

  it("영어 번역은 싣지 않는다", () => {
    expect(findExampleTranslation("`どこにいたの？`\n*(Where were you?)*", "どこにいたの？")).toBeNull();
  });
});
