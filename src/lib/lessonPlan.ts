// 선생님이 먼저 제시하는 "오늘의 수업" — 지금 단원을 무슨 순서로 배울까.
//
// 무엇을 가르칠지는 커리큘럼과 진도에서 나오는 값이라 모델에게 맡기지 않는다(오늘의 학습과 같은 판단). 모델은 고른
// 문형을 설명만 한다. 틀려도 화면은 멀쩡하다 — 이미 배운 문형을 또 권하거나 안 배운 걸 건너뛰고, 사용자는 왜
// 그런지 모른다. 그래서 순수 함수로 두고 lessonPlan.test.ts가 고정한다.

import type { UnitProgress } from "./curriculumProgress";
import type { CurriculumUnit, GrammarPoint } from "../types/curriculum";

export type LessonStep = {
  /** 저장에도 쓰는 키. 문형은 `단원키:문형`이다. */
  key: string;
  emoji: string;
  title: string;
  detail: string;
  /** 문형의 예문 — 커리큘럼에 적힌 것이라 AI 없이도 보여 줄 수 있다. */
  example?: string;
  done: boolean;
  action:
    | { kind: "ask"; question: string }
    | { kind: "go"; to: string }
    | { kind: "check" };
};

/** 문형을 배우는 질문. 학습자 말풍선으로 보이고 그대로 선생님에게 간다. */
export function grammarLessonQuestion(grammar: GrammarPoint): string {
  return [
    `${grammar.pattern} 문법을 알려줘.`,
    `예문 「${grammar.example}」처럼 쓰는 거 맞아?`,
    "어떤 상황에서 쓰는지, 비슷한 표현과 뭐가 다른지도 알려줘.",
  ].join("\n");
}

export function grammarStepKey(unitKey: string, pattern: string): string {
  return `${unitKey}:${pattern}`;
}

/**
 * 이 단원의 수업 순서. **문자 → 문형 → 한자 → 단어 → 단원 점검.** 문형이 수업의 중심이라 앞에 오고, 문자를 모르면
 * 문형 설명을 읽을 수 없으니 그보다 먼저다. 점검은 언제나 마지막이고 "끝난" 상태가 없다 — 통과해서 완료로 표시하면
 * 다음 단원의 수업으로 넘어가기 때문이다.
 */
export function buildLessonSteps(
  progress: UnitProgress,
  unit: CurriculumUnit,
  taught: readonly string[]
): LessonStep[] {
  const steps: LessonStep[] = [];

  const kanaTotal = progress.kanaDone.length + progress.kanaTodo.length;
  if (kanaTotal > 0) {
    steps.push({
      key: `${progress.key}:kana`,
      emoji: "あ",
      title: `가나 익히기 (${progress.kanaDone.length}/${kanaTotal})`,
      detail: progress.kanaTodo.slice(0, 6).join(" ") || "다 익혔어요",
      done: progress.kanaTodo.length === 0,
      action: { kind: "go", to: "/gojuon" },
    });
  }

  for (const grammar of unit.grammarPoints) {
    const key = grammarStepKey(progress.key, grammar.pattern);
    steps.push({
      key,
      emoji: "🧑‍🏫",
      title: `${grammar.pattern} 배우기`,
      detail: grammar.meaning,
      example: grammar.example,
      done: taught.includes(key),
      action: { kind: "ask", question: grammarLessonQuestion(grammar) },
    });
  }

  const kanjiTotal = progress.kanjiDone.length + progress.kanjiTodo.length;
  if (kanjiTotal > 0) {
    steps.push({
      key: `${progress.key}:kanji`,
      emoji: "漢",
      title: `한자 익히기 (${progress.kanjiDone.length}/${kanjiTotal})`,
      detail: progress.kanjiTodo.join(" ") || "다 익혔어요",
      done: progress.kanjiTodo.length === 0,
      action: { kind: "go", to: kanjiStepPath(progress) },
    });
  }

  if (progress.wordsTarget > 0) {
    const themes = unit.vocabThemes.length > 0 ? unit.vocabThemes.join(", ") : "이번 단원";
    steps.push({
      key: `${progress.key}:words`,
      emoji: "📖",
      title: `단어 익히기 (${Math.min(progress.wordsDone, progress.wordsTarget)}/${progress.wordsTarget})`,
      detail: `${themes} 관련 단어를 찾아 단어장에 담아보세요.`,
      done: progress.wordsDone >= progress.wordsTarget,
      action: { kind: "go", to: "/dictionary" },
    });
  }

  steps.push({
    key: `${progress.key}:check`,
    emoji: "🎯",
    title: "단원 점검",
    detail: "3~5분 문제로 이 단원을 다 익혔는지 확인해요.",
    done: false,
    action: { kind: "check" },
  });
  return steps;
}

/** 남은 첫 글자를 바로 연다(오늘의 학습과 같은 이유 — 그냥 /kanji는 마지막에 보던 급수를 연다). */
function kanjiStepPath(progress: UnitProgress): string {
  const first = progress.kanjiTodo[0] ?? progress.kanjiDone[0];
  return first ? `/kanji?k=${encodeURIComponent(first)}` : "/kanji";
}

/**
 * 방금 끝난 문답이 이 단원의 어느 문형 수업인가. **버튼을 누를 때가 아니라 답변이 끝난 뒤에 판단한다** — 누를 때 표시했더니
 * 답변이 오류로 실패해도 그 문형을 배운 것으로 치고 다음으로 넘어갔다(미리보기에서 실제로 그랬다). 질문 글자로 찾으므로
 * 대문 "오늘의 학습"이나 로드맵에서 넘어온 같은 질문도 잡힌다. 실패·거절 답변이면 null.
 */
export function taughtStepFromExchange(
  steps: readonly LessonStep[],
  question: string | undefined,
  answer: string | undefined,
  notAnAnswer: readonly string[]
): LessonStep | null {
  if (!question || !answer?.trim() || notAnAnswer.includes(answer)) return null;
  return steps.find((s) => s.action.kind === "ask" && s.action.question === question) ?? null;
}

/**
 * 지금 할 단계 — 아직 안 끝낸 첫 단계. 점검이 항상 남아 있어서 null이 되지 않지만, 빈 목록이면 null.
 * AI를 못 쓰는 브라우저에서는 문형 수업을 건너뛴다 — 눌러도 답을 못 받는다. 문자·한자·단어·점검은 AI 없이 된다.
 */
export function nextLessonStep(steps: readonly LessonStep[], aiAvailable = true): LessonStep | null {
  return steps.find((s) => !s.done && (aiAvailable || s.action.kind !== "ask")) ?? null;
}

/**
 * 이 단계를 시작하러 어디로 갈까 — "수업 시작" 버튼들의 목적지. 선생님이 할 일(문형·점검)이면 선생님 화면, 다른 화면에서
 * 하는 일이면 그 화면으로 바로 보낸다. 입문자를 선생님 화면에 들렀다가 다시 오십음도로 돌려보내지 않으려는 것이다.
 */
export function lessonStepPath(step: LessonStep | null): string {
  return step?.action.kind === "go" ? step.action.to : "/teacher";
}
