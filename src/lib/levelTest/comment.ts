import { REFUSE_PROMPT_DISCLOSURE } from "../promptSafety";
import { CURRICULUM_LEVELS } from "../../types/curriculum";
import type { EstimatedLevel, LevelTestSection } from "../../types/levelTest";
import { SECTION_LABEL } from "./labels";
import { SECTION_ORDER, type LevelTestSections } from "./result";
import { EXAM_TIMINGS, STUDY_PURPOSES, type LevelTestProfile } from "./profile";

// 레벨 진단 결과에 붙는 "선생님 한마디"(AI). 진단 자체는 코드가 하고, 모델은 끝에 총평 한 번만 쓴다.
//
// **프롬프트에 학습자가 친 글자는 한 글자도 들어가지 않는다** — 영역별 급수·정답 수·버튼으로 고른 공부
// 목적과 시험 일정뿐이고 전부 코드가 만든 문자열이다. 그래서 4중 방어 중 입력 감싸기(wrapStudentText)는
// 해당이 없고, 나머지(거절 규칙·출력 가드·세션 버리기)는 그대로 건다. AI를 못 쓰면 `fallbackComment`가
// 대신한다 — 진단은 AI 없이 도는 기능이라 총평만 빠지면 된다.

export const LEVEL_COMMENT_SYSTEM_PROMPT = [
  "당신은 한국인 학습자를 가르치는 친절한 일본어 선생님입니다.",
  "학습자가 방금 레벨 진단을 마쳤습니다. 결과를 보고 총평을 해 주세요.",
  "",
  "규칙:",
  "- 한국어로 3~5문장, 다정한 말투로 쓰세요. 소제목·목록·표는 쓰지 마세요.",
  "- 급수와 점수는 이미 정해졌습니다. 다시 판정하거나 다른 급수를 말하지 마세요.",
  "- 잘한 영역을 먼저 짚고, 가장 약한 영역 하나를 골라 다음에 무엇부터 하면 좋을지 한 가지만 권하세요.",
  "- 공부 목적이나 시험 일정이 있으면 그에 맞춰 권하세요.",
  "- 일본어 예문은 쓰지 마세요.",
  "- 인사말이나 자기소개로 시작하지 마세요.",
  REFUSE_PROMPT_DISCLOSURE,
].join("\n");

/**
 * 유출 검사 기준 — 위 지시문에서 **답변 모양 지시(문장 수·말투·무엇을 권할지)를 뺀 것**. 모델이 시키는
 * 대로 "잘한 영역은… 가장 약한 영역은…"이라고 쓰면 그 지시와 조각이 겹쳐 멀쩡한 총평이 거절로 바뀐다
 * (선생님 ①②③ 오탐과 같은 함정 — CLAUDE.md 프롬프트 인젝션 절).
 */
export const LEVEL_COMMENT_LEAK_REFERENCE = [
  "당신은 한국인 학습자를 가르치는 친절한 일본어 선생님입니다.",
  "급수와 점수는 이미 정해졌습니다. 다시 판정하거나 다른 급수를 말하지 마세요.",
  "인사말이나 자기소개로 시작하지 마세요.",
  REFUSE_PROMPT_DISCLOSURE,
].join("\n");

function levelText(level: EstimatedLevel): string {
  return level === "Pre-N5" ? "입문(N5 전)" : level;
}

/** 결과 요약을 모델에게 줄 글로. 코드가 만든 값만 들어간다. */
export function buildLevelCommentPrompt(
  sections: LevelTestSections,
  overall: EstimatedLevel | null,
  profile: LevelTestProfile,
): string {
  const lines = ["레벨 진단 결과:"];
  lines.push(`- 종합: ${overall ? levelText(overall) : "판정 불가"}`);
  for (const s of SECTION_ORDER) {
    const r = sections[s];
    if (!r) continue;
    if (r.estimate === null) {
      lines.push(`- ${SECTION_LABEL[s]}: 측정 안 함`);
      continue;
    }
    const level = s === "kana" ? (r.estimate === "Pre-N5" ? "연습 필요" : "통과") : levelText(r.estimate);
    lines.push(`- ${SECTION_LABEL[s]}: ${level} (${r.total}문제 중 ${r.correct}개 정답)`);
  }
  const purpose = STUDY_PURPOSES.find((p) => p.id === profile.purpose);
  if (purpose && purpose.id !== "other") lines.push(`- 공부 목적: ${purpose.label}`);
  if (profile.exam === "none") lines.push("- 볼 예정인 시험: 없음");
  else if (profile.exam) {
    const plan = profile.exam;
    const timing = EXAM_TIMINGS.find((t) => t.id === plan.timing);
    lines.push(`- 볼 예정인 시험: JLPT ${plan.level}${timing ? `, ${timing.label}` : ""}`);
  }
  lines.push("", "위 결과로 총평을 써 주세요.");
  return lines.join("\n");
}

/**
 * 가장 약한 영역 — 측정한 JLPT 영역 중 추정 급수가 가장 낮은 것. 가나를 통과하지 못했으면 가나가 먼저다.
 * 같으면 화면 순서(어휘 → 한자 → 문법 → 독해 → 청해)에서 먼저 나오는 쪽.
 */
export function weakestSection(sections: LevelTestSections): LevelTestSection | null {
  if (sections.kana?.estimate === "Pre-N5") return "kana";
  let weakest: LevelTestSection | null = null;
  let low = Infinity;
  for (const s of SECTION_ORDER) {
    if (s === "kana") continue;
    const e = sections[s]?.estimate;
    if (e == null) continue;
    const rank = CURRICULUM_LEVELS.indexOf(e);
    if (rank < low) {
      low = rank;
      weakest = s;
    }
  }
  return weakest;
}

/** AI 없이 쓰는 다음 할 일 — 이미 있는 화면으로 보낸다(오늘의 학습과 같은 방식). */
const NEXT_STEP: Record<LevelTestSection, string> = {
  kana: "오십음도에서 히라가나·가타카나부터 차근차근 익혀 보세요.",
  vocab: "사전에서 단어를 찾아 단어장에 담고, 매일 조금씩 복습해 보세요.",
  kanji: "한자 페이지에서 급수별 한자를 익히고 퀴즈로 확인해 보세요.",
  grammar: "선생님에게 지금 단계의 문형을 하나씩 물어보며 정리해 보세요.",
  reading: "짧은 글을 소리 내어 읽고, 모르는 단어는 눌러서 확인하는 연습을 해 보세요.",
  listening: "회화 연습에서 상대 문장을 들어 보고, 발음 버튼으로 따라 읽어 보세요.",
};

/**
 * AI를 못 쓸 때(지원 안 함·모델 없음·실패·유출)의 총평. 급수 뒤에 조사를 붙이지 않는다 — "N4가/N1이"처럼
 * 읽는 소리에 따라 갈린다.
 */
export function fallbackComment(sections: LevelTestSections, overall: EstimatedLevel | null): string {
  if (!overall) return "이번에는 결과를 낼 만큼 문제를 풀지 못했어요. 시간 날 때 한 번 더 진단해 보세요.";
  const weakest = weakestSection(sections);
  const head = `종합 결과는 ${levelText(overall)} — 이 단계부터 시작하면 알맞아요.`;
  if (!weakest) return head;
  return `${head} 이번 진단에서 가장 아쉬운 영역은 ${SECTION_LABEL[weakest]}. ${NEXT_STEP[weakest]}`;
}
