import { describe, expect, it } from "vitest";
import curriculum from "../data/curriculum.json";
import levelTestBank from "../data/level-test-bank.json";
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

describe("segmentSentenceIntoWords (급수 외 단어)", () => {
  // 사전을 흔한 단어까지 넓히며 생긴 오탐. 커리큘럼 예문 전수 비교로 찾았다.
  it("급수 외 단어는 읽기로 찾지 않는다 — あります의 あり가 蟻(개미)가 되면 안 된다", () => {
    expect(wordAt("本はテーブルの上にあります。", "あり")).toBeNull();
  });

  it("가나로 쓴 寝た를 ねた(이야깃거리)로 잡지 않는다", () => {
    expect(wordAt("はやくねたほうがいいです。", "ねた")).toBeNull();
  });

  it("넓힌 덕에 한 단어로 잡히는 것", () => {
    expect(wordAt("私も日本人です。", "日本人")).toBe("日本人");
    expect(wordAt("毎日日本語を勉強します。", "日本語")).toBe("日本語");
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

  /** 그 조각 위에 달리는 읽기. 없으면 null. */
  const rtOf = (sentence: string, text: string) => {
    const ruby = rubyFor(segOf(sentence, text));
    return ruby ? ruby.map((f) => f.rt ?? "").join("") : null;
  };

  it("활용형의 어간에 사전형의 읽기를 단다 (실제로 보고받았다)", () => {
    // 食이 名詞 食(しょく)로 잡혀 「食べます」 위에 しょく가 떴다.
    expect(rtOf("朝ごはんを食べます。", "食べ")).toBe("た");
    expect(rtOf("子供に野菜を食べさせます。", "食べ")).toBe("た");
    expect(rtOf("日本へ行って、友だちに会いました。", "行")).toBe("い");
    expect(rtOf("日本へ行って、友だちに会いました。", "会")).toBe("あ");
    expect(rtOf("大きい声で話してください。", "話")).toBe("はな");
    expect(rtOf("試験は難しかったです。", "難し")).toBe("むずか");
    expect(rtOf("彼はもう着いているはずです。", "着")).toBe("つ");
    expect(rtOf("試合は行われる。", "行")).toBe("おこな");
  });

  it("활용형의 어간을 누르면 사전형으로 간다", () => {
    expect(segOf("朝ごはんを食べます。", "食べ").word?.word).toBe("食べる");
    expect(segOf("日本へ行って、", "行").word?.word).toBe("行く");
  });

  it("来る의 읽기는 뒤 글자에 따라 갈린다", () => {
    expect(rtOf("バスが来なかったんです。", "来")).toBe("こ");
    expect(rtOf("会社に来た。", "来")).toBe("き");
    expect(rtOf("友だちが来ます。", "来")).toBe("き");
  });

  it("조사 앞의 명사를 동사 어간으로 잡지 않는다", () => {
    expect(rtOf("雨で行けません。", "雨")).toBe("あめ");
    expect(rtOf("彼の話は面白いです。", "話")).toBe("はなし");
    expect(segOf("彼の話は面白いです。", "話").word?.pos).toContain("n");
  });

  it("혼자 쓰인 글자는 접미사 읽기로 읽지 않는다", () => {
    // 첫 common을 집어서 店이 てん, 人이 じん, 上이 かみ로 읽혔다(문제 은행 전수로 확인).
    expect(rtOf("この店は安いです。", "店")).toBe("みせ");
    expect(rtOf("たくさんの人が来ました。", "人")).toBe("ひと");
    expect(rtOf("本はテーブルの上にあります。", "上")).toBe("うえ");
    expect(rtOf("空が暗くなってきた。", "空")).toBe("そら");
  });

  it("한자 뒤의 人은 접미사로 읽는다", () => {
    expect(rtOf("韓国人です。", "人")).toBe("じん");
  });

  it("숫자+단위를 글자별로 쪼개 읽지 않는다 (실제로 보고받았다)", () => {
    // 四(し)+時(とき)로 「しとき」가 떴다.
    expect(rtOf("わたしは四時に行きます。", "四時")).toBe("よじ");
    expect(rtOf("パーティーは六時からです。", "六時")).toBe("ろくじ");
    expect(rtOf("この寺は六百年前に建てられた。", "六百年")).toBe("ろっぴゃくねん");
  });

  it("사전 표제어가 있으면 숫자 계산보다 표제어를 쓴다", () => {
    expect(rtOf("一人だけです。", "一人")).toBe("ひとり");
  });

  it("보통 가나로 쓰는 항목을 한자 자리에 읽지 않는다", () => {
    // 彼가 あれ로, 彼の가 あの로, 何時가 いつ로 읽혔다.
    expect(rtOf("彼は学生です。", "彼")).toBe("かれ");
    expect(rtOf("彼の話は面白いです。", "彼")).toBe("かれ");
    expect(rtOf("今何時ですか。", "何時")).toBe("なんじ");
  });

  it("명사와 동사의 읽기가 다르면 동사를 쓴다", () => {
    // 入り(いり)가 먼저 잡혀 「入ります」가 いります로, 越し(ごし)가 잡혀 「お越し」가 おごし로 읽혔다.
    expect(rtOf("部屋に入ります。", "入")).toBe("はい");
    expect(rtOf("お越しください。", "越")).toBe("こ");
  });

  it("方은 비교의 が 앞에서만 ほう로 읽는다", () => {
    expect(rtOf("電車よりバスの方が安いです。", "方")).toBe("ほう");
    expect(rtOf("方は先生です。", "方")).toBeNull();
  });

  it("빈칸 앞의 동사 어간에는 읽기를 달지 않는다", () => {
    expect(rtOf("日本に来＿＿、一度も帰っていない。", "来")).toBeNull();
  });

  it("복합 명사의 読み를 동사로 바꾸지 않는다", () => {
    expect(rtOf("入り口はあちらです。", "入り口")).toBe("いりぐち");
  });

  it("흔한 동사 둘로 갈리면 읽기를 달지 않는다", () => {
    // 開か는 あく도 ひらく도 된다 — 「朝市が開かれて」에 あ가 달렸다.
    expect(rtOf("朝市が開かれています。", "開")).toBeNull();
  });

  it("숫자·성씨 뒤의 글자를 그 읽기 아래로 넣지 않는다", () => {
    const segments = segmentSentenceIntoWords("田中さんは四時に来ます。");
    expect(segments.find((s) => s.ruby?.[0]?.ruby === "田中")?.text).toBe("田中");
    expect(segments.map((s) => s.text).join("")).toBe("田中さんは四時に来ます。");
  });

  it("흔한 성씨를 글자별로 쪼개 읽지 않는다 (실제로 보고받았다)", () => {
    expect(rtOf("田中さんは飲みます。", "田中")).toBe("たなか");
    expect(rtOf("鈴木さんです。", "鈴木")).toBe("すずき");
  });

  it("사전에 없는 복합어는 틀리게 읽느니 읽기를 달지 않는다", () => {
    // 金閣寺가 金(かね)+閣+寺(てら)가 됐다.
    expect(rtOf("金閣寺へ行きました。", "金")).toBeNull();
    expect(rtOf("金閣寺へ行きました。", "寺")).toBeNull();
  });

  it("문제 은행·커리큘럼 전체에서 조각 읽기가 원문을 바꾸지 않는다", () => {
    const strings = (v: unknown): string[] =>
      typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
    for (const text of new Set([...strings(levelTestBank), ...strings(curriculum)])) {
      const segments = segmentSentenceIntoWords(text);
      expect(segments.map((s) => s.text).join("")).toBe(text);
      for (const seg of segments) {
        const ruby = rubyFor(seg);
        if (ruby) expect(ruby.map((f) => f.ruby).join("")).toBe(seg.text);
      }
    }
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
