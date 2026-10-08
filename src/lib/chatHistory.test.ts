import { describe, expect, it } from "vitest";
import {
  OUTPUT_RESERVE_TOKENS,
  estimateTokens,
  estimateTurnTokens,
  fitHistory,
  historyBudget,
  wouldOverflow,
  type ChatTurn,
} from "./chatHistory";
import { GEMMA_MAX_TOKENS } from "./gemmaEngine";
import { TEACHER_SYSTEM_PROMPT, buildMemoryBlock, buildTeacherUserPrompt } from "./teacherPrompts";
import { EMPTY_PROFILE } from "./learnerProfile";

// 새 세션에 앞선 대화를 다시 채우는 계산. 틀려도 콘솔은 조용하다 — 너무 적게 넣으면 선생님이
// "부정형으로 바꾸면?"을 앞 문장 없이 받고, 너무 많이 넣으면 세션 생성이 실패하거나 답이 잘린다.

const pair = (q: string, a: string): ChatTurn[] => [
  { role: "user", content: q },
  { role: "assistant", content: a },
];

describe("estimateTokens", () => {
  it("한글·가나·한자는 글자당 1토큰으로 넉넉하게 센다", () => {
    expect(estimateTokens("부정형")).toBe(3);
    expect(estimateTokens("食べ物")).toBe(3);
  });

  it("영문·숫자·기호는 3글자당 1토큰", () => {
    expect(estimateTokens("abcdef")).toBe(2);
    expect(estimateTokens("## 1.")).toBe(2);
  });
});

describe("fitHistory", () => {
  const turns = [...pair("질문1", "답1"), ...pair("질문2", "답2"), ...pair("질문3", "답3")];

  it("예산이 넉넉하면 전부, 원래 순서대로 넣는다", () => {
    expect(fitHistory(turns, 10_000)).toEqual(turns);
  });

  it("모자라면 최근 쌍부터 넣는다", () => {
    const onePair = estimateTurnTokens(turns[4]) + estimateTurnTokens(turns[5]);
    expect(fitHistory(turns, onePair)).toEqual(turns.slice(4));
    expect(fitHistory(turns, onePair - 1)).toEqual([]);
  });

  it("질문·답을 반쪽만 넣지 않는다", () => {
    const pairCost = estimateTurnTokens(turns[4]) + estimateTurnTokens(turns[5]);
    expect(fitHistory(turns, pairCost + 5)).toHaveLength(2);
  });

  it("안 들어가는 쌍을 만나면 그보다 오래된 짧은 쌍을 건너뛰어 끼워 넣지 않는다", () => {
    const mixed = [...pair("짧", "짧"), ...pair("길게", "아주 ".repeat(200)), ...pair("최근", "답")];
    const recent = estimateTurnTokens(mixed[4]) + estimateTurnTokens(mixed[5]);
    const old = estimateTurnTokens(mixed[0]) + estimateTurnTokens(mixed[1]);
    // 최근 + 맨 앞 짧은 쌍은 들어갈 자리가 있지만, 가운데가 빠진 대화가 되므로 최근만.
    expect(fitHistory(mixed, recent + old)).toEqual(mixed.slice(4));
  });

  it("짝이 안 맞는 모양이면 거기서 멈춘다", () => {
    const broken: ChatTurn[] = [{ role: "assistant", content: "a" }, ...pair("q", "a")];
    expect(fitHistory(broken, 10_000)).toEqual(broken.slice(1));
  });
});

describe("historyBudget / wouldOverflow", () => {
  it("예산은 음수가 되지 않는다", () => {
    expect(historyBudget(100, "가".repeat(500), "질문")).toBe(0);
  });

  it("창에서 시스템 지시·질문·답변 몫을 뺀 만큼이다", () => {
    const budget = historyBudget(8000, "", "");
    expect(budget).toBeLessThan(8000 - OUTPUT_RESERVE_TOKENS);
    expect(budget).toBeGreaterThan(8000 - OUTPUT_RESERVE_TOKENS - 50);
  });

  it("답변 몫까지 남지 않으면 넘친다고 본다", () => {
    expect(wouldOverflow(1000, "질문", 8192)).toBe(false);
    expect(wouldOverflow(8192 - OUTPUT_RESERVE_TOKENS, "질문", 8192)).toBe(true);
  });

  // 4096일 때는 선생님 시스템 프롬프트(기억 블록 포함)만으로 거의 다 차서 앞선 대화를 사실상 못
  // 실었다. 지시문이 길어지거나 창을 줄이면 조용히 그 상태로 돌아가므로 숫자로 못박아 둔다.
  it("Gemma에서 선생님 지시문 + 기억 블록을 넣고도 긴 답변 두 턴은 실을 자리가 남는다", () => {
    const profile = {
      ...EMPTY_PROFILE,
      levelGuess: "N4" as const,
      weakKanji: [{ kanji: "曜", wrong: 3, correct: 1 }],
      weakWords: ["食べ物", "真面目"],
      recentStudy: ["한자 퀴즈 N4", "단어장 복습"],
    };
    const memory = buildMemoryBlock(profile, [], {
      levelLabel: "N4",
      unitNumber: 3,
      unitTitle: "부탁하기",
      canDoGoals: ["간단한 부탁을 할 수 있다"],
      grammarPatterns: ["〜てください", "〜てもいいですか"],
      remainingKanji: ["曜", "週"],
    });
    const system = `${TEACHER_SYSTEM_PROMPT}\n${memory}`;
    const budget = historyBudget(GEMMA_MAX_TOKENS, system, buildTeacherUserPrompt("부정형 문장으로 바꾸면?"));
    const longTurn =
      estimateTurnTokens({ role: "user", content: buildTeacherUserPrompt("わたしは 食べ物 にまじめだ") }) +
      estimateTurnTokens({ role: "assistant", content: "가".repeat(900) });
    expect(budget).toBeGreaterThan(longTurn * 2);
  });
});
