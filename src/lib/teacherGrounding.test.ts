import { describe, expect, it } from "vitest";
import curriculumData from "../data/curriculum.json";
import type { Curriculum } from "../types/curriculum";
import {
  GROUNDING_MAX_GRAMMAR,
  GROUNDING_MAX_WORDS,
  buildTeacherGrounding,
  deinflect,
  findGroundingWords,
  japaneseRuns,
} from "./teacherGrounding";

// 선생님 질문 옆에 붙이는 사전 참고. 모델은 "앱 사전"이라고 적힌 줄을 믿는다 — 여기서 활용형을 엉뚱한
// 사전형으로 되돌리거나(行った → 行う) 가나 조각을 엉뚱한 낱말로 잡으면(わたし → 綿) 모델이 그걸 그대로
// 설명한다. 화면도 콘솔도 조용하다.

const curriculum = curriculumData as unknown as Curriculum;
const ground = (q: string) => buildTeacherGrounding([q], curriculum) ?? "";
const lemma = (text: string) => deinflect(text)?.word ?? null;

describe("deinflect — 활용형을 사전형으로", () => {
  it.each([
    ["読みました", "読む"],
    ["読んだ", "読む"],
    ["降って", "降る"],
    ["持って", "持つ"],
    ["書いてください", "書く"],
    ["食べます", "食べる"],
    ["見ません", "見る"],
    ["来ました", "来る"],
    ["勉強して", "勉強"],
    ["寒かった", "寒い"],
    ["安くて", "安い"],
    ["行きたい", "行く"],
    ["分かりません", "分かる"],
  ])("%s → %s", (text, expected) => expect(lemma(text)).toBe(expected));

  // 커리큘럼 예문 전수로 잡은 오답들.
  it("行った는 行う가 아니라 行く", () => expect(lemma("行った")).toBe("行く"));
  it("抜けない는 가능형 부정(抜く)이 아니라 1단 抜ける", () => expect(lemma("抜けない")).toBe("抜ける"));
  it("가나 한 글자 어간은 흔한 N5 동사가 아니면 버린다", () => {
    expect(lemma("ついた")).toBeNull(); // 吐く로 잡혔다
    expect(lemma("させます")).not.toBe("注す");
  });
  it("가나 어간에는 する 규칙을 걸지 않는다", () => expect(lemma("ほんとうします")).toBeNull());
  it("사전형 자체는 여기서 안 잡는다(분절 몫)", () => expect(lemma("読む")).toBeNull());
});

describe("findGroundingWords — 분절보다 길게 잡히면 활용형이 이긴다", () => {
  it("「読みました」를 名詞 読み가 아니라 動詞 読む로", () => {
    const { words } = findGroundingWords("部屋で本を読みました。");
    expect(words.map((w) => w.entry.word)).toContain("読む");
    expect(words.map((w) => w.entry.word)).not.toContain("読み");
  });
  it("낱말로 못 잡은 한자는 따로 돌려준다", () => {
    expect(findGroundingWords("見に行く").kanji).toContain("見");
  });
});

describe("buildTeacherGrounding", () => {
  it("동사에는 사전형·문장 속 형태·활용표가 붙는다", () => {
    const g = ground("部屋で本を読みました。 이 문장 뜻이 뭐야?");
    expect(g).toContain("- 読む (よむ)");
    expect(g).toContain("문장 속 「読みました」");
    expect(g).toContain("ない형 読まない");
    expect(g).toContain("て형 読んで");
  });

  it("한국어 뜻은 앞 세 개까지 — 本이 「이」로만 나가지 않는다", () => {
    expect(ground("本を読む")).toMatch(/- 本 \(ほん\).*뜻: 이 \/ 책/);
  });

  it("가나 두 글자 이하 조각·조사·조동사는 싣지 않는다 — わたし가 綿(목화)로 나갔다", () => {
    const g = ground("わたしは食べ物にまじめだ");
    expect(g).not.toContain("綿");
    expect(g).not.toMatch(/^- (は|に|だ) /m);
    expect(g).toContain("- 食べ物 (たべもの)");
  });

  it("가나로 쓰는 동사는 표제어·활용형도 가나로", () => {
    const g = ground("毎日日本語を勉強しています");
    expect(g).toContain("- いる ·");
    expect(g).toContain("ます형 います");
    expect(g).not.toContain("居ます");
  });

  it("커리큘럼 문형을 같이 싣는다", () => {
    expect(ground("日本へ行くために、お金を貯めています。")).toContain("- 〜ために (N4)");
    // 커리큘럼이 없으면 문형 없이 낱말만
    expect(buildTeacherGrounding(["日本へ行くために"], null)).not.toContain("[문형 참고]");
  });

  it("한국어만 있는 질문은 null", () => {
    expect(buildTeacherGrounding(["물을 마신다는 일본어로?"], curriculum)).toBeNull();
    expect(buildTeacherGrounding([], curriculum)).toBeNull();
  });

  it("머리말이 '지어내지 말라'와 '학습자가 쓴 글이 아니다'를 말한다", () => {
    const g = ground("面白い映画");
    expect(g.startsWith("[사전 참고]")).toBe(true);
    expect(g).toContain("지어내지 마세요");
    expect(g).toContain("학습자가 쓴 글이 아닙니다");
  });

  it("긴 지문을 넣어도 낱말·문형 줄 수에 상한이 있다", () => {
    const long = "昨日は友達と映画を見に行きました。それから、レストランで晩ご飯を食べて、駅まで歩いて帰りました。".repeat(4);
    const g = ground(long);
    const lines = g.split("\n");
    const grammarAt = lines.indexOf("[문형 참고]");
    const wordLines = (grammarAt === -1 ? lines : lines.slice(0, grammarAt)).filter((l) => l.startsWith("- "));
    expect(wordLines.length).toBeLessThanOrEqual(GROUNDING_MAX_WORDS);
    if (grammarAt !== -1) expect(lines.length - grammarAt - 1).toBeLessThanOrEqual(GROUNDING_MAX_GRAMMAR);
  });

  it("커리큘럼 예문 전부에서 깨지지 않고, 되돌린 사전형은 동사·형용사·する명사다", () => {
    for (const level of curriculum.levels) {
      for (const unit of level.units) {
        for (const point of unit.grammarPoints) {
          expect(() => buildTeacherGrounding([point.example], curriculum)).not.toThrow();
          for (const run of japaneseRuns(point.example)) {
            for (const { entry, text } of findGroundingWords(run).words) {
              if (text === entry.word || text === entry.reading) continue;
              expect(entry.pos.some((p) => /^(v|adj-i)/.test(p)), `${text} → ${entry.word}`).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("japaneseRuns", () => {
  it("한국어 질문 속 일본어 구간만 뽑는다", () => {
    expect(japaneseRuns("「どこにいたの？」 이 문장이 어떤 의미야?")).toEqual(["「どこにいたの？」"]);
    expect(japaneseRuns("조사 だけ 알려줘")).toEqual(["だけ"]);
    expect(japaneseRuns("、。")).toEqual([]); // 문장부호뿐인 구간
  });
});
