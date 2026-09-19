import { describe, expect, it } from "vitest";
import { KANJI_NOT_IN_APP, buildCurriculumPlan, type ProgressInput } from "./curriculumProgress";
import { kanjiList } from "./kanji";
import curriculumData from "../data/curriculum.json";
import type { StudyEvent, StudyEventType } from "./learnerMemoryDb";
import type { Curriculum, CurriculumLevelId } from "../types/curriculum";

// 진도는 조용히 틀린다 — 어긋나도 화면에는 그럴듯한 퍼센트가 뜨고, 사용자는 엉뚱한 유닛을
// 공부하게 된다. 한 번 잘못 열린 유닛은 되돌아갈 길도 없다.

const curriculum = curriculumData as unknown as Curriculum;

let clock = 0;
function event(type: StudyEventType, subject: string, extra: Partial<StudyEvent> = {}): StudyEvent {
  clock += 1000;
  return { at: clock, type, subject, ...extra };
}

function plan(overrides: Partial<ProgressInput> = {}) {
  return buildCurriculumPlan(curriculum, {
    events: [],
    learnedKanji: [],
    manualUnits: [],
    startLevel: "N5",
    ...overrides,
  });
}

describe("KANJI_NOT_IN_APP", () => {
  it("실제로 kanji.json에 없는 글자만, 빠짐없이 담고 있다", () => {
    // 이 목록이 실제 데이터와 어긋나면 해당 유닛이 영영 100%가 되지 않아 자동 완료가
    // 막힌다(하드코딩한 이유는 curriculumProgress.ts 주석 참고 — 이 테스트가 그 대가다).
    const available = new Set(kanjiList.map((k) => k.kanji));
    const missing = new Set<string>();
    for (const level of curriculum.levels) {
      for (const unit of level.units) {
        for (const k of unit.kanjiFocus ?? []) {
          if (!available.has(k)) missing.add(k);
        }
      }
    }
    expect([...missing].sort()).toEqual([...KANJI_NOT_IN_APP].sort());
  });
});

describe("buildCurriculumPlan", () => {
  it("시작 단계보다 쉬운 단계는 진도에서 빠진다", () => {
    // N3부터 시작한 사람에게 히라가나 유닛을 시키면 앱을 닫는다.
    const levels = new Set(plan({ startLevel: "N3" }).units.map((u) => u.level));
    expect(levels.has("Pre-N5")).toBe(false);
    expect(levels.has("N5")).toBe(false);
    expect(levels.has("N3")).toBe(true);
  });

  it("아무것도 안 했으면 시작 단계의 첫 유닛이 지금 할 일이다", () => {
    const { current } = plan({ startLevel: "N5" });
    expect(current?.level).toBe("N5");
    expect(current?.unitNumber).toBe(1);
  });

  it("학습 완료한 한자가 이번 유닛의 남은 목록에서 빠진다", () => {
    const { current } = plan({ startLevel: "N5", learnedKanji: ["私", "日"] });
    expect(current?.kanjiDone).toEqual(["私", "日"]);
    expect(current?.kanjiTodo).not.toContain("私");
  });

  it("퀴즈에서 맞힌 한자도 아는 것으로 친다", () => {
    const { current } = plan({ startLevel: "N5", events: [event("kanji-quiz-correct", "私")] });
    expect(current?.kanjiDone).toContain("私");
  });

  it("틀린 한자는 아는 것으로 치지 않는다", () => {
    const { current } = plan({ startLevel: "N5", events: [event("kanji-quiz-wrong", "私")] });
    expect(current?.kanjiDone).not.toContain("私");
  });

  it("같은 급수의 단어 할당량을 유닛 순서대로 떼어 쓴다", () => {
    // 커리큘럼의 vocabThemes에 해당하는 필드가 dictionary.json에 없어서 단어를 유닛에
    // 직접 묶을 수 없다. 급수 단위로 세고 순서대로 나눠 갖는 방식이라, 이 배분이 어긋나면
    // 1단원을 채우지도 않았는데 2단원이 채워진 것처럼 보인다.
    const words = Array.from({ length: 20 }, (_, i) =>
      event("word-added", `단어${i}`, { level: "N5" })
    );
    const units = plan({ startLevel: "N5", events: words }).units.filter((u) => u.level === "N5");
    expect(units[0].wordsDone).toBe(15); // 1단원 할당량(15)을 다 채우고
    expect(units[1].wordsDone).toBe(5); // 남은 5개가 2단원으로
    expect(units[2].wordsDone).toBe(0);
  });

  it("같은 단어를 여러 번 건드려도 한 개로 센다", () => {
    const events = [
      event("word-added", "水", { level: "N5" }),
      event("word-looked-up", "水", { level: "N5" }),
      event("word-review-known", "水", { level: "N5" }),
    ];
    expect(plan({ startLevel: "N5", events }).units[0].wordsDone).toBe(1);
  });

  it("급수가 없는 단어 이벤트는 할당량에 안 들어간다", () => {
    expect(plan({ startLevel: "N5", events: [event("word-added", "水")] }).units[0].wordsDone).toBe(0);
  });

  it("직접 완료 처리한 유닛은 건너뛰고 다음 유닛으로 간다", () => {
    const { current } = plan({ startLevel: "N5", manualUnits: ["N5-1"] });
    expect(current?.unitNumber).toBe(2);
    expect(current?.level).toBe("N5");
  });

  it("직접 완료한 유닛은 진척도가 100%로 잡힌다", () => {
    const first = plan({ startLevel: "N5", manualUnits: ["N5-1"] }).units[0];
    expect(first.ratio).toBe(1);
    expect(first.complete).toBe(true);
    expect(first.manual).toBe(true);
  });

  it("뒤쪽 유닛을 먼저 끝내도 건너뛴 앞 유닛으로 되돌아온다", () => {
    // 커리큘럼은 순서가 있는 물건이다. 2단원이 우연히 채워졌다고 1단원을 넘기면 안 된다.
    const { current } = plan({ startLevel: "N5", manualUnits: ["N5-2", "N5-3"] });
    expect(current?.unitNumber).toBe(1);
  });

  it("Pre-N5는 가나를 들어본 만큼 진도가 오른다", () => {
    const events = [event("kana-studied", "あ"), event("kana-studied", "い")];
    const first = plan({ startLevel: "Pre-N5", events }).units[0];
    expect(first.kanaDone).toEqual(["あ", "い"]);
    expect(first.ratio).toBeGreaterThan(0);
    expect(first.complete).toBe(false);
  });

  it("앱에 없는 한자는 총계에서 빠져 유닛이 막히지 않는다", () => {
    // 於는 kanji.json에 없어서 학습할 방법이 아예 없다. 총계에 남겨두면 N2 1단원이
    // 영원히 99%에서 멈춘다.
    const n2first = plan({ startLevel: "N2" }).units[0];
    expect([...n2first.kanjiDone, ...n2first.kanjiTodo]).not.toContain("於");
  });

  it("커리큘럼을 다 끝내면 current가 null이 된다", () => {
    const all = plan({ startLevel: "N1" }).units.map((u) => u.key);
    const done = plan({ startLevel: "N1", manualUnits: all });
    expect(done.current).toBeNull();
    expect(done.completedCount).toBe(done.totalCount);
  });

  it("시작 단계를 바꿔도 유닛 키는 그대로다", () => {
    // 키는 진도 저장의 기본값이라, 시작 단계를 옮겼다고 달라지면 기존 진도가 날아간다.
    const fromN5 = plan({ startLevel: "N5" }).units.find((u) => u.level === "N3" && u.unitNumber === 2);
    const fromN3 = plan({ startLevel: "N3" }).units.find((u) => u.level === "N3" && u.unitNumber === 2);
    expect(fromN5?.key).toBe("N3-2");
    expect(fromN3?.key).toBe("N3-2");
  });
});

describe("커리큘럼 데이터", () => {
  it("모든 단계가 유닛을 갖고 있고 번호가 1부터 이어진다", () => {
    for (const level of curriculum.levels) {
      const numbers = level.units.map((u) => u.unitNumber).sort((a, b) => a - b);
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it("일본어 예문에 라틴 문자나 한글이 섞여 있지 않다", () => {
    // 원본에 `毎日japanese勉強を勉強します。`처럼 깨진 예문이 있었다. 예문은 그대로
    // 화면에 나가고 발음까지 읽히므로 조용히 넘어가면 안 된다.
    const broken: string[] = [];
    for (const level of curriculum.levels) {
      for (const unit of level.units) {
        for (const g of unit.grammarPoints) {
          // N1의 이중경어 단원만 설명이 한국어로 섞여 있는 것이 의도된 예외다.
          if (g.pattern.includes("이중경어")) continue;
          if (/[A-Za-z가-힣]/.test(g.example)) broken.push(`${level.level} ${g.pattern}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("읽기(exampleReading)에 한자가 남아 있지 않다", () => {
    const withKanji: string[] = [];
    for (const level of curriculum.levels) {
      for (const unit of level.units) {
        for (const g of unit.grammarPoints) {
          if (/[一-鿿]/.test(g.exampleReading)) withKanji.push(`${level.level} ${g.pattern}`);
        }
      }
    }
    expect(withKanji).toEqual([]);
  });

  it("모든 단계 이름이 CurriculumLevelId와 맞는다", () => {
    const known: CurriculumLevelId[] = ["Pre-N5", "N5", "N4", "N3", "N2", "N1"];
    for (const level of curriculum.levels) expect(known).toContain(level.level);
  });
});
