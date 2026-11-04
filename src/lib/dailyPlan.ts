// "오늘은 이걸 하세요" 목록을 만든다.
//
// 추천이라고 해서 LLM에게 시키지 않는다 — 무엇이 남았는지는 진도에서 빼면 나오는 값이고,
// 모델에게 맡기면 매번 다른 말을 하면서 정작 안 한 한자를 놓친다. 순수 함수이고
// dailyPlan.test.ts가 고정한다.
//
// 각 항목은 앱 안의 **이미 있는 화면으로 보내는 것**을 목표로 한다. 새 학습 화면을 만드는
// 대신 한자/사전/회화/작문/선생님을 커리큘럼 순서대로 이어 붙이는 것이 이 기능의 전부다.

import { grammarLessonQuestion } from "./lessonPlan";
import type { LearnerProfile } from "./learnerProfile";
import type { UnitProgress } from "./curriculumProgress";
import type { CurriculumUnit } from "../types/curriculum";

/**
 * 하루에 한 번 띄우는 선생님 인사. **모델이 아니라 앱이 만든다.**
 *
 * 프롬프트에 맡기면 매 답변이 "안녕하세요! 일본어 공부를 도와드릴 선생님입니다 😊"로 시작해서
 * 금세 지겨워지는데, "하루에 한 번만"은 모델이 지킬 수 있는 규칙이 아니다 — 이전 답변을 셀 수
 * 없기 때문이다. 날짜와 진도로 판단할 수 있는 것은 코드가 한다(표기 유지·후리가나와 같은 방침).
 */
export function buildTeacherGreeting(opts: {
  streak: number;
  levelLabel?: string | null;
  unitNumber?: number | null;
  unitTitle?: string | null;
}): string {
  const parts: string[] = [];
  // 하루짜리 스트릭에 "1일 연속"이라고 하면 어색하다 — 이틀째부터 세어준다.
  parts.push(opts.streak >= 2 ? `안녕하세요! 🔥 ${opts.streak}일 연속이네요.` : "안녕하세요! 👋");

  if (opts.levelLabel && opts.unitNumber && opts.unitTitle) {
    parts.push(`오늘은 ${opts.levelLabel} ${opts.unitNumber}단원 「${opts.unitTitle}」을 이어서 해볼까요?`);
  } else {
    parts.push("오늘은 뭐가 궁금하세요?");
  }

  return parts.join(" ");
}

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
/** 복습을 먼저 권할 약한 항목(한자+단어)의 최소 개수. */
const WEAK_REVIEW_THRESHOLD = 2;

/** "약한 것 모아 풀기"를 여는 주소 — WordbookPage가 이 쿼리를 보고 풀기 시트를 연다. */
export const WEAK_REVIEW_PATH = "/wordbook?review=weak";

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

  const targets = profile.reviewTargets;
  const weakCount = targets.kanji.length + targets.words.length;
  if (weakCount >= WEAK_REVIEW_THRESHOLD) {
    // 한자 목록만 보여주던 예전과 달리 단어도 같이 모은다. 예전엔 /kanji로 보내기만 해서
    // 거기서 어느 글자를 봐야 하는지는 학습자가 기억해야 했다 — 이제 바로 문제로 푼다.
    const preview = [...targets.kanji, ...targets.words.map((w) => w.word)].slice(0, 4);
    actions.push({
      id: "review-weak",
      emoji: "🔁",
      title: `약한 것 ${weakCount}개 모아 풀기`,
      detail: `${preview.join(" ")} — 틀렸거나 몰랐던 한자·단어예요.`,
      to: WEAK_REVIEW_PATH,
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
      // 그 글자를 바로 연다 — 그냥 /kanji로 보내면 마지막에 보던 급수(처음이면 N5)가 떠서, N3 학습자가
      // 엉뚱한 목록에서 글자를 찾아야 한다. 한자 페이지가 주소의 글자에 맞춰 급수도 옮긴다.
      to: `/kanji?k=${encodeURIComponent(progress.kanjiTodo[0])}`,
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
      teacherQuestion: grammarLessonQuestion(grammar),
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

export interface HomeStart {
  to: string;
  label: string;
  /** 버튼 아래 작은 줄 — 누르면 무엇을 하게 되는지. */
  hint?: string;
  teacherQuestion?: string;
}

/**
 * 대문의 큰 시작 버튼이 어디로 갈까.
 *
 * - **시작 단계를 고르기 전의 처음 온 사람에게는 버튼이 없다(null).** 그 자리에서는 단계 고르기가 곧
 *   시작이다 — 버튼이 있으면 N3 학습자도 고르기 전에 눌러 히라가나 표에 도착한다.
 * - 단계를 골랐으면 오늘의 첫 할 일로 간다. 대문 카드가 N3 단원을 보여주는 바로 위에서 버튼이 오십음도로
 *   가던 것이 이 함수가 생긴 이유다.
 * - 추천을 아직 못 읽었으면(`actions: null`) 지금 단원이 보이는 로드맵으로 보낸다.
 * - 예전부터 쓰던 사람은 단계를 안 골랐어도 막지 않는다.
 */
export function planHomeStart(opts: {
  hasStartLevel: boolean;
  returning: boolean;
  actions: readonly PlanAction[] | null;
}): HomeStart | null {
  const label = opts.returning ? "이어서 학습하기" : "학습 시작하기";
  if (!opts.hasStartLevel) return opts.returning ? { to: "/gojuon", label } : null;

  const first = opts.actions?.[0];
  if (!first) return { to: "/curriculum", label };
  return { to: first.to, label, hint: first.title, teacherQuestion: first.teacherQuestion };
}
