import type { JlptLevel } from "../../types/jlpt";
import type { MemoryFactKind } from "../learnerMemoryDb";
import { sanitizeMemoryLine } from "../promptSafety";

// 진단 첫머리의 두 질문(공부 목적·시험 일정). **버튼으로만 고른다** — 자유 입력이 없으니 학습자가
// 친 글자가 선생님 시스템 프롬프트에 들어갈 일이 없다. 학습자가 직접 고른 것이라 확인 칩 없이 바로
// "확인된 기억"으로 넣는다(구현 프롬프트 9절 결정). 문장은 코드가 만든다.

export type StudyPurpose = "travel" | "exam" | "work" | "hobby" | "other";

export const STUDY_PURPOSES: { id: StudyPurpose; label: string; emoji: string }[] = [
  { id: "travel", label: "여행", emoji: "✈️" },
  { id: "exam", label: "시험", emoji: "📝" },
  { id: "work", label: "일", emoji: "💼" },
  { id: "hobby", label: "취미", emoji: "🎮" },
  { id: "other", label: "기타", emoji: "💬" },
];

export type ExamTiming = "3m" | "6m" | "1y" | "later";

export const EXAM_TIMINGS: { id: ExamTiming; label: string }[] = [
  { id: "3m", label: "3개월 안" },
  { id: "6m", label: "6개월 안" },
  { id: "1y", label: "1년 안" },
  { id: "later", label: "1년 넘게" },
];

/** null = 아직 안 골랐음, "none" = 볼 시험이 없음 */
export type ExamPlan = "none" | { level: JlptLevel; timing: ExamTiming };

export type LevelTestProfile = { purpose: StudyPurpose | null; exam: ExamPlan | null };

const PURPOSE_TEXT: Record<StudyPurpose, string | null> = {
  travel: "일본 여행에서 쓰려고 일본어를 공부한다",
  exam: "시험을 보려고 일본어를 공부한다",
  work: "일에 쓰려고 일본어를 공부한다",
  hobby: "취미로 일본어를 공부한다",
  // "기타"는 기억할 만한 내용이 없다 — 선생님에게 "목표: 기타"를 알려줘 봐야 쓸 데가 없다.
  other: null,
};

const TIMING_TEXT: Record<ExamTiming, string> = {
  "3m": "3개월 안에",
  "6m": "6개월 안에",
  "1y": "1년 안에",
  later: "1년 넘게 뒤에",
};

/**
 * 고른 것을 기억 문장으로. 기억은 선생님 시스템 프롬프트에 들어가는 자리라 코드가 만든 문장도
 * `sanitizeMemoryLine`을 통과시킨다(규칙을 한 곳에서 지키려고 — 나중에 선택지가 늘어도 같은 길로 간다).
 * 날짜를 붙여 둔다 — "6개월 안에"는 고른 날을 모르면 의미가 없다.
 */
export function profileFacts(profile: LevelTestProfile, todayKey: string): { kind: MemoryFactKind; text: string }[] {
  const facts: { kind: MemoryFactKind; text: string }[] = [];
  const purpose = profile.purpose && PURPOSE_TEXT[profile.purpose];
  if (purpose) facts.push({ kind: "goal", text: purpose });
  if (profile.exam && profile.exam !== "none") {
    facts.push({
      kind: "schedule",
      text: `JLPT ${profile.exam.level} 시험을 ${TIMING_TEXT[profile.exam.timing]} 볼 예정이다(${todayKey} 기준)`,
    });
  }
  return facts.map((f) => ({ ...f, text: sanitizeMemoryLine(f.text) }));
}
