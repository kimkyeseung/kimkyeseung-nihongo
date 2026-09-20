import { describe, expect, it } from "vitest";
import { rubyFor, segmentSentenceIntoWords } from "./sentenceWords";

// 문장을 단어로 쪼개는 일은 조용히 틀린다 — 엉뚱한 단어가 붙어도 콘솔은 멀쩡하고, 눌러본
// 사용자만 "왜 ため가 과거형이지?" 하고 만다. 실제로 그렇게 보고받아 고쳤다.

/** 그 글자를 눌렀을 때 뜨는 사전 표제어. 안 잡히면 null. */
function wordAt(sentence: string, text: string): string | null {
  const seg = segmentSentenceIntoWords(sentence).find((s) => s.text === text);
  return seg?.word?.word ?? null;
}

describe("segmentSentenceIntoWords", () => {
  it("가나로 쓴 ため를 為로 잡는다", () => {
    // 사전에 `word: "為"` / `reading: "ため"`로 들어 있어 표기 색인만으로는 안 잡혔고,
    // 그리디가 길이 1까지 내려가 **조동사 た**를 집었다.
    expect(wordAt("本人確認のため、氏名を記入してください。", "ため")).toBe("為");
    expect(wordAt("会議のために資料を準備しました。", "ため")).toBe("為");
  });

  it("ます 활용을 단어로 착각하지 않는다", () => {
    // 읽기를 전부 색인에 넣었더니 ました가 増す+舌로, します가 縞+酢로 잡혔다.
    const segments = segmentSentenceIntoWords("毎日日本語を勉強します。");
    const words = segments.filter((s) => s.word).map((s) => s.word!.word);
    expect(words).not.toContain("増す");
    expect(words).not.toContain("縞");
    expect(words).not.toContain("島");
    expect(words).not.toContain("酢");
  });

  it("ました·ましょう의 まし를 増し로 잡지 않는다", () => {
    expect(wordAt("昨日、映画を見ました。", "まし")).toBeNull();
    expect(wordAt("一緒に行きましょう。", "まし")).toBeNull();
  });

  it("수동형의 まれ를 稀로 잡지 않는다", () => {
    expect(wordAt("電車で足を踏まれました。", "まれ")).toBeNull();
  });

  it("です의 す를 為로 잡지 않는다", () => {
    // 한 글자 읽기를 허용하면 為(す) 하나 때문에 모든 です·ます가 오염된다.
    expect(wordAt("私は学生です。", "す")).toBeNull();
  });

  it("uk가 주변적인 뜻에만 붙은 단어는 읽기로 찾지 않는다", () => {
    // 島는 첫 뜻이 "island"(한자로 쓴다)이고 uk는 은어인 "구역" 뜻에만 붙어 있다.
    // "하나라도 uk면"으로 판정하던 시절엔 「勉強します」의 しま가 島로 잡혔다.
    expect(wordAt("毎日日本語を勉強します。", "しま")).toBeNull();
  });

  it("가나로 쓰는 다른 단어들도 제대로 잡는다", () => {
    expect(wordAt("あなたは学生ですか。", "あなた")).toBe("貴方");
    expect(wordAt("トイレはあそこです。", "あそこ")).toBe("彼処");
    expect(wordAt("ここに名前を書いてください。", "ください")).toBe("下さい");
    expect(wordAt("寝坊したせいで遅刻しました。", "せい")).toBe("所為");
  });

  it("今日は를 인사말로 잡지 않는다", () => {
    // 그리디가 세 글자 今日は(こんにちは)를 집어서, 今日에 こんにち 후리가나가 붙고
    // 눌러보면 "hello"가 떴다. 여기의 は는 조사고 今日는 きょう다.
    expect(wordAt("今日は天気が良いです。", "今日")).toBe("今日");
    expect(wordAt("今日は天気が良いです。", "今日は")).toBeNull();
    expect(wordAt("今晩は月がきれいです。", "今晩")).toBe("今晩");
  });

  it("그래도 가나로 쓴 こんにちは는 인사말로 잡는다", () => {
    // 한자 표기만 막은 것이지 인사말을 지운 게 아니다 — 실제로 쓰는 표기는 이쪽이다.
    expect(wordAt("こんにちは、田中です。", "こんにちは")).toBe("今日は");
  });

  it("긴 쪽이 맞는 복합어는 그대로 긴 쪽으로 잡는다", () => {
    // "짧은 쪽을 고른다"는 일반 규칙으로 갔다면 전부 깨졌을 것들이다.
    expect(wordAt("非常に難しい問題です。", "非常に")).toBe("非常に");
    expect(wordAt("実は私も行きます。", "実は")).toBe("実は");
    expect(wordAt("急に雨が降りました。", "急に")).toBe("急に");
  });

  it("한자로 쓴 단어는 그대로 표기로 잡는다", () => {
    expect(wordAt("毎日水を飲みます。", "毎日")).toBe("毎日");
    expect(wordAt("毎日水を飲みます。", "水")).toBe("水");
  });

  it("사전에 없는 부분은 단어로 만들지 않는다", () => {
    // 뜻은 정적 사전에서만 온다 — 못 찾으면 원문 그대로 두는 게 맞다.
    const segments = segmentSentenceIntoWords("ぴょこぴょこ");
    expect(segments.every((s) => s.word === null)).toBe(true);
  });

  it("쪼갠 조각을 이어 붙이면 원문이 그대로 나온다", () => {
    // 한 글자라도 흘리면 화면에서 문장이 조용히 바뀐다.
    for (const s of [
      "本人確認のため、氏名を記入してください。",
      "早く寝たほうがいいです。",
      "日本へ行ったことがあります。",
    ]) {
      expect(segmentSentenceIntoWords(s).map((x) => x.text).join("")).toBe(s);
    }
  });
});

describe("rubyFor", () => {
  // 사전 정보를 덧씌우는 것이지 원문을 고치는 게 아니다. 읽기 색인을 넣은 직후
  // 「〜のため、」가 「〜の為ため、」로, 「ください」가 「下ください」로 렌더됐다.
  const segOf = (sentence: string, text: string) =>
    segmentSentenceIntoWords(sentence).find((s) => s.text === text)!;

  it("가나로 쓴 자리에는 표제어의 후리가나를 덧씌우지 않는다", () => {
    expect(rubyFor(segOf("本人確認のため、氏名を記入してください。", "ため"))).toBeNull();
    expect(rubyFor(segOf("ここに名前を書いてください。", "ください"))).toBeNull();
  });

  it("표기가 표제어와 같을 때만 후리가나를 준다", () => {
    const ruby = rubyFor(segOf("毎日水を飲みます。", "毎日"));
    expect(ruby).not.toBeNull();
    expect(ruby!.map((f) => f.ruby).join("")).toBe("毎日");
  });

  it("今日에 こんにち가 아니라 きょう를 붙인다", () => {
    // 화면에 보고된 증상 그대로 — 「今日は天気が良いです」의 今日 위에 こんにち가 떴다.
    const ruby = rubyFor(segOf("今日は天気が良いです。", "今日"));
    expect(ruby!.map((f) => f.rt).join("")).toBe("きょう");
  });

  it("후리가나가 원문과 다른 글자를 만들지 않는다", () => {
    // 각 조각의 ruby를 이어 붙이면 언제나 그 조각의 원문이어야 한다.
    for (const s of ["本人確認のため、氏名を記入してください。", "毎日水を飲みます。"]) {
      for (const seg of segmentSentenceIntoWords(s)) {
        const ruby = rubyFor(seg);
        if (ruby) expect(ruby.map((f) => f.ruby).join("")).toBe(seg.text);
      }
    }
  });
});
