// "오늘은 이걸 하세요" 목록을 만든다.
//
// 추천이라고 해서 LLM에게 시키지 않는다 — 무엇이 남았는지는 진도에서 빼면 나오는 값이고,
// 모델에게 맡기면 매번 다른 말을 하면서 정작 안 한 한자를 놓친다. 순수 함수이고
// dailyPlan.test.ts가 고정한다.
//
// 각 항목은 앱 안의 **이미 있는 화면으로 보내는 것**을 목표로 한다. 새 학습 화면을 만드는
// 대신 한자/사전/회화/작문/선생님을 커리큘럼 순서대로 이어 붙이는 것이 이 기능의 전부다.

import type { LearnerProfile } from "./learnerProfile";
import type { UnitProgress } from "./curriculumProgress";
import type { CurriculumUnit } from "../types/curriculum";

export interface PlanAction {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  /** 눌렀을 때 갈 라우트. */
  to: string;
  /**
   * `/teacher`로 보낼 때 대신 물어봐 줄 질문. TeacherPage가
   * `teacherChatStore.requestQuestion()`으로 받아 바로 묻는다(AskTeacherButton과 같은 경로).
   */
  teacherQuestion?: string;
}

/** 한 번에 보여줄 항목 수. 너무 많으면 "오늘 할 일"이 아니라 할 일 목록이 된다. */
const MAX_ACTIONS = 4;
/** 복습을 먼저 권할 취약 한자의 최소 개수. */
const WEAK_KANJI_THRESHOLD = 2;

/**
 * 오늘의 추천. **복습 → 새 내용 → 연습** 순서로 쌓는다.
 *
 * 취약한 것을 먼저 놓는 이유는, 새 유닛으로 계속 밀고 나가면 틀린 한자가 영영 틀린 채로
 * 남기 때문이다. 다만 취약 항목이 한두 개뿐일 때는 진도를 막을 만한 일이 아니라서 넘긴다.
 */
export function buildDailyPlan(
  progress: UnitProgress | null,
  unit: CurriculumUnit | undefined,
  profile: LearnerProfile
): PlanAction[] {
  const actions: PlanAction[] = [];

  if (profile.weakKanji.length >= WEAK_KANJI_THRESHOLD) {
    const list = profile.weakKanji.slice(0, 4).map((k) => k.kanji);
    actions.push({
      id: "review-weak-kanji",
      emoji: "🔁",
      title: "틀렸던 한자 다시 보기",
      detail: `${list.join(" ")} — 퀴즈에서 자주 놓친 글자예요.`,
      to: "/kanji",
    });
  }

  if (!progress || !unit) {
    // 커리큘럼을 다 끝냈거나 아직 시작 단계를 안 골랐을 때.
    actions.push({
      id: "free-practice",
      emoji: "💬",
      title: "자유롭게 연습하기",
      detail: "회화로 오늘 배운 표현을 써보세요.",
      to: "/conversation",
    });
    return actions.slice(0, MAX_ACTIONS);
  }

  if (progress.kanaTodo.length > 0) {
    actions.push({
      id: "kana",
      emoji: "あ",
      title: `가나 ${progress.kanaTodo.length}자 익히기`,
      detail: `${progress.kanaTodo.slice(0, 6).join(" ")} — 눌러서 소리를 들어보세요.`,
      to: "/gojuon",
    });
  }

  if (progress.kanjiTodo.length > 0) {
    actions.push({
      id: "kanji",
      emoji: "漢",
      title: `한자 ${progress.kanjiTodo.length}자 익히기`,
      detail: `${progress.kanjiTodo.join(" ")} — 이번 단원의 한자예요.`,
      to: "/kanji",
    });
  }

  const wordsLeft = progress.wordsTarget - progress.wordsDone;
  if (wordsLeft > 0) {
    const themes = unit.vocabThemes.length > 0 ? unit.vocabThemes.join(", ") : "이번 단원";
    actions.push({
      id: "words",
      emoji: "📖",
      title: `단어 ${wordsLeft}개 더 보기`,
      detail: `${themes} 관련 단어를 찾아 단어장에 담아보세요.`,
      to: "/dictionary",
    });
  }

  // 문법은 앱에 전용 화면이 없다. 선생님에게 대신 물어봐 주는 쪽이 새 화면을 만드는 것보다
  // 낫고, 답변 속 일본어에는 사전 후리가나·발음 버튼이 그대로 붙는다.
  const grammar = unit.grammarPoints[0];
  if (grammar) {
    actions.push({
      id: "grammar",
      emoji: "🧑‍🏫",
      title: `문법 ${grammar.pattern} 배우기`,
      detail: grammar.meaning,
      to: "/teacher",
      teacherQuestion: [
        `${grammar.pattern} 문법을 알려줘.`,
        `예문 「${grammar.example}」처럼 쓰는 거 맞아?`,
        "어떤 상황에서 쓰는지, 비슷한 표현과 뭐가 다른지도 알려줘.",
      ].join("\n"),
    });
  }

  if (progress.ratio >= 1) {
    actions.push({
      id: "practice",
      emoji: "✏️",
      title: "배운 걸로 문장 써보기",
      detail: `"${progress.canDoGoals[0] ?? unit.title}"를 해낼 수 있는지 확인해보세요.`,
      to: "/writing",
    });
  }

  return actions.slice(0, MAX_ACTIONS);
}
