import { describe, expect, it } from "vitest";
import { buildLearnerProfile, guessLevel, scoreKanji } from "./learnerProfile";
import type { StudyEvent, StudyEventType } from "./learnerMemoryDb";

// 이 파일의 함수들은 전부 "조용히 틀리는" 종류다 — 틀려도 결과가 0건이 되는 게 아니라
// 엉뚱한 급수/엉뚱한 취약 한자가 그럴듯하게 나오고, 그게 선생님 시스템 프롬프트에 박혀
// 설명 난이도를 통째로 바꾼다. 콘솔에는 아무것도 안 뜬다.

let clock = 0;
function event(type: StudyEventType, subject: string, extra: Partial<StudyEvent> = {}): StudyEvent {
  clock += 1000;
  return { at: clock, type, subject, ...extra };
}

describe("guessLevel", () => {
  it("근거가 충분한 급수 중 가장 어려운 쪽을 고른다", () => {
    const events = [
      ...["一", "二", "三", "四", "五", "六"].map((k) => event("kanji-learned", k, { level: "N5" })),
      ...["映", "銀", "習", "働", "european"].map((k) => event("kanji-learned", k, { level: "N4" })),
    ];
    expect(guessLevel(events).level).toBe("N4");
  });

  it("근거가 모자라면 null을 준다 — 함부로 N5로 찍지 않는다", () => {
    // 찍어버리면 선생님이 "초급이시니까"로 시작한다. 모를 땐 모른다고 해야 한다.
    const events = [event("kanji-learned", "一", { level: "N5" })];
    expect(guessLevel(events).level).toBeNull();
  });

  it("같은 항목을 여러 번 건드린 건 한 개로 센다", () => {
    // "열 번 틀렸다"는 "열 개를 공부했다"가 아니다. 항목 단위로 세지 않으면 한자 하나를
    // 반복해서 틀린 사람이 갑자기 N1 학습자가 된다.
    const events = Array.from({ length: 10 }, () => event("kanji-quiz-wrong", "薔", { level: "N1" }));
    expect(guessLevel(events).level).toBeNull();
  });

  it("급수가 없는 이벤트는 무시한다", () => {
    const events = Array.from({ length: 10 }, (_, i) => event("teacher-question", `질문${i}`));
    expect(guessLevel(events).level).toBeNull();
  });
});

describe("scoreKanji", () => {
  it("한자별로 정답·오답을 합산한다", () => {
    const scores = scoreKanji([
      event("kanji-quiz-wrong", "食"),
      event("kanji-quiz-wrong", "食"),
      event("kanji-quiz-correct", "食"),
      event("kanji-quiz-correct", "水"),
    ]);
    expect(scores.get("食")).toEqual({ kanji: "食", wrong: 2, correct: 1 });
    expect(scores.get("水")).toEqual({ kanji: "水", wrong: 0, correct: 1 });
  });

  it("퀴즈가 아닌 이벤트는 점수에 섞이지 않는다", () => {
    const scores = scoreKanji([event("kanji-learned", "食"), event("word-added", "食べる")]);
    expect(scores.size).toBe(0);
  });
});

describe("buildLearnerProfile", () => {
  it("틀린 쪽이 많은 한자만 취약 한자로 본다", () => {
    const profile = buildLearnerProfile([
      event("kanji-quiz-wrong", "薔"),
      event("kanji-quiz-wrong", "薔"),
      // 한 번 틀렸지만 그 뒤로 두 번 맞혔으면 이제 약점이 아니다.
      event("kanji-quiz-wrong", "水"),
      event("kanji-quiz-correct", "水"),
      event("kanji-quiz-correct", "水"),
    ]);
    expect(profile.weakKanji.map((k) => k.kanji)).toEqual(["薔"]);
  });

  it("틀린 적 없이 여러 번 맞힌 한자를 강점으로 본다", () => {
    const profile = buildLearnerProfile([
      event("kanji-quiz-correct", "水"),
      event("kanji-quiz-correct", "水"),
      // 한 번만 맞힌 건 우연일 수 있어 강점으로 치지 않는다.
      event("kanji-quiz-correct", "火"),
    ]);
    expect(profile.strongKanji).toEqual(["水"]);
  });

  it("최근에 공부한 것이 최신 순으로 나온다", () => {
    const profile = buildLearnerProfile([
      event("kanji-learned", "一"),
      event("word-added", "食べる"),
      event("teacher-question", "は와 が 차이"),
    ]);
    expect(profile.recentStudy[0]).toContain("は와 が 차이");
    expect(profile.recentStudy[2]).toContain("一");
  });

  it("들어온 순서가 뒤죽박죽이어도 시간순으로 다시 정렬한다", () => {
    // 호출하는 쪽이 늘어나도 "마지막에 공부한 것"이 뒤집히지 않아야 한다.
    const older = event("kanji-learned", "一");
    const newer = event("teacher-question", "て형");
    const profile = buildLearnerProfile([older, newer].reverse());
    expect(profile.recentStudy[0]).toContain("て형");
  });

  it("뜻을 찾아본 단어를 약한 어휘로 모은다", () => {
    const profile = buildLearnerProfile([
      event("word-looked-up", "難しい"),
      event("word-looked-up", "簡単"),
      // 같은 단어를 두 번 찾아봐도 목록에는 한 번만.
      event("word-looked-up", "難しい"),
    ]);
    expect(profile.weakWords).toEqual(["難しい", "簡単"]);
  });

  it("첨삭 지적 요지는 원문이 아니라 detail에서 가져온다", () => {
    const profile = buildLearnerProfile([
      event("writing-corrected", "私は학생です", { detail: "조사 は와 が를 헷갈렸어요" }),
    ]);
    expect(profile.strugglePoints).toEqual(["조사 は와 が를 헷갈렸어요"]);
  });

  it("같은 지적을 여러 번 받아도 목록에는 한 번만 나온다", () => {
    const profile = buildLearnerProfile([
      event("writing-corrected", "문장1", { detail: "て형 활용이 틀렸어요" }),
      event("writing-corrected", "문장2", { detail: "て형 활용이 틀렸어요" }),
    ]);
    expect(profile.strugglePoints).toEqual(["て형 활용이 틀렸어요"]);
  });

  it("기록이 없으면 빈 프로필을 준다", () => {
    const profile = buildLearnerProfile([]);
    expect(profile.levelGuess).toBeNull();
    expect(profile.recentStudy).toEqual([]);
    expect(profile.totalEvents).toBe(0);
  });
});
