import { describe, expect, it } from "vitest";
import { assignGrammarToFirstSentence, findGrammarInSentence, patternFragments } from "./grammarPatterns";
import curriculumData from "../data/curriculum.json";
import type { Curriculum } from "../types/curriculum";

// 조용히 틀리는 종류다 — 엉뚱한 문법이 그럴듯한 설명과 함께 붙어도 콘솔은 멀쩡하고,
// 학습자는 그걸 배운다. 노이즈 기준은 커리큘럼 예문 123개에 돌려보고 정했다.

const curriculum = curriculumData as unknown as Curriculum;

const patternsIn = (sentence: string) =>
  findGrammarInSentence(curriculum, sentence).map((m) => m.point.pattern);

const ALL_EXAMPLES: string[] = curriculum.levels.flatMap((l) =>
  l.units.flatMap((u) => u.grammarPoints.map((g) => g.example))
);

describe("patternFragments", () => {
  it("〜를 걷어내고 일본어 조각만 남긴다", () => {
    expect(patternFragments("〜たことがあります")).toEqual(["たことがあります"]);
    expect(patternFragments("〜ながら")).toEqual(["ながら"]);
  });

  it("괄호 안이 진짜 형태인 패턴을 살려낸다", () => {
    // `形容詞의 과거형 (〜かったです)`의 바깥은 설명이고 쓸 것은 괄호 안이다.
    expect(patternFragments("形容詞의 과거형 (〜かったです)")).toContain("かったです");
  });

  it("한글 설명뿐인 패턴은 조각이 없다", () => {
    // "동사 て형"은 문장과 대조할 게 없다 — 억지로 "동사"를 찾으면 안 된다.
    expect(patternFragments("동사 て형")).toEqual([]);
    expect(patternFragments("동사 た형")).toEqual([]);
  });

  it("너무 흔한 조각은 빼버린다", () => {
    // です·ます가 남으면 거의 모든 문장에 「〜は〜です」가 1순위로 붙어 정작 그 문장에서
    // 배울 문형을 밀어낸다.
    expect(patternFragments("〜は〜です")).toEqual([]);
    expect(patternFragments("〜ます/〜ません")).toEqual([]);
  });
});

describe("findGrammarInSentence", () => {
  it("문장에 실제로 든 문형을 찾는다", () => {
    expect(patternsIn("会議のために資料を準備しました。")).toContain("〜ために");
    expect(patternsIn("音楽を聞きながら勉強します。")).toContain("〜ながら");
    expect(patternsIn("寝坊したせいで遅刻しました。")).toContain("〜せいで");
    expect(patternsIn("頑張ったのに、失敗しました。")).toContain("〜のに");
    expect(patternsIn("雨が降ったら、行きません。")).toContain("〜たら");
  });

  it("구체적인 문형을 먼저 준다", () => {
    // 「〜たことがあります」와 「〜があります」가 같이 걸리면 전자가 그 문장의 배울 거리다.
    expect(patternsIn("日本へ行ったことがあります。")[0]).toBe("〜たことがあります");
  });

  it("평범한 정중형 문장에는 아무것도 붙이지 않는다", () => {
    expect(patternsIn("私は学生です。")).toEqual([]);
    expect(patternsIn("彼女は親切な人です。")).toEqual([]);
  });

  it("지시대명사처럼 그 자체가 단원인 것은 붙여준다", () => {
    // 「これは私の本です」에 「これ/それ/あれ」가 붙는 건 맞다 — N5 2단원이 그 단원이다.
    expect(patternsIn("これは私の本です。")).toContain("これ/それ/あれ");
  });

  it("낱말 안에 우연히 들어간 글자를 문법으로 보지 않는다", () => {
    // 「ほうがいい」 안의 "うが"가 N1의 「〜うが〜うが」로 잡혔다 — 문자열 대조라 낱말
    // 경계를 모른다.
    expect(patternsIn("早く寝たほうがいいです。")).not.toContain("〜うが〜うが");
    expect(patternsIn("早く寝たほうがいいです。")).toContain("〜ほうがいいです");
  });

  it("같은 자리를 가리키는 문형은 하나만 남긴다", () => {
    // 「〜ても」와 「たとえ〜ても」가 같은 ても에 걸린다. 둘 다 띄우면 같은 말을 두 번 한다.
    const spans = findGrammarInSentence(curriculum, "何度説明しても分かりません。").map(
      (m) => `${m.start}-${m.end}`
    );
    expect(new Set(spans).size).toBe(spans.length);
  });

  it("한 문장에 세 개를 넘기지 않는다", () => {
    for (const s of ALL_EXAMPLES) {
      expect(findGrammarInSentence(curriculum, s).length).toBeLessThanOrEqual(3);
    }
  });

  it("커리큘럼 예문 전체에서 평균 두 개를 넘지 않는다", () => {
    // 노이즈 회귀 감시. 조각 기준을 낮추면 여기가 먼저 터진다.
    const total = ALL_EXAMPLES.reduce(
      (sum, s) => sum + findGrammarInSentence(curriculum, s, 99).length,
      0
    );
    expect(total / ALL_EXAMPLES.length).toBeLessThan(2);
  });

  it("문법이 없는 문장에는 빈 배열을 준다", () => {
    expect(findGrammarInSentence(curriculum, "水")).toEqual([]);
    expect(findGrammarInSentence(curriculum, "")).toEqual([]);
  });

  it("돌려주는 자리가 실제로 그 문장의 구간이다", () => {
    // start/end가 어긋나면 화면에서 엉뚱한 글자를 가리키게 된다.
    for (const s of ALL_EXAMPLES) {
      for (const m of findGrammarInSentence(curriculum, s)) {
        expect(m.start).toBeGreaterThanOrEqual(0);
        expect(m.end).toBeLessThanOrEqual(s.length);
        expect(s.slice(m.start, m.end).length).toBe(m.end - m.start);
      }
    }
  });
});

describe("assignGrammarToFirstSentence", () => {
  it("같은 문형은 처음 나온 예문에만 붙는다", () => {
    const sentences = ["水だけ飲みます。", "一つだけください。", "百円しかありません。"];
    const first = patternsIn(sentences[0]);
    expect(first.length).toBeGreaterThan(0);
    const assigned = assignGrammarToFirstSentence(curriculum, sentences);
    expect([...assigned.get(sentences[0])!]).toEqual(first);
    // 뒤 문장에는 앞에서 이미 나온 패턴이 다시 붙지 않는다.
    for (const later of sentences.slice(1)) {
      for (const pattern of assigned.get(later)!) expect(first).not.toContain(pattern);
    }
  });

  it("뒤 문장에만 있는 새 문형은 그대로 남긴다", () => {
    const sentences = ["水だけ飲みます。", "日曜日だけ休みます。"];
    const assigned = assignGrammarToFirstSentence(curriculum, sentences);
    const onlyInSecond = patternsIn(sentences[1]).filter((p) => !patternsIn(sentences[0]).includes(p));
    expect([...assigned.get(sentences[1])!]).toEqual(onlyInSecond);
  });

  it("앞뒤 공백은 무시하고, 같은 문장은 한 번만 계산한다", () => {
    const assigned = assignGrammarToFirstSentence(curriculum, [" 水だけ飲みます。", "水だけ飲みます。 "]);
    expect(assigned.size).toBe(1);
    expect([...assigned.get("水だけ飲みます。")!]).toEqual(patternsIn("水だけ飲みます。"));
  });
});
