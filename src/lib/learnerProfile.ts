// 학습 이벤트 더미에서 "이 학습자는 어떤 사람인가"를 뽑아낸다.
//
// **여기에 LLM을 쓰지 않는다.** 취약한 한자·어휘 수준·마지막에 공부한 것은 전부 기록에서
// 세면 나오는 값이라, 이 프로젝트 규칙("정답이 정해진 정보는 LLM에게 시키지 않는다")대로
// 결정적으로 계산한다. 모델에게 맡기는 건 대화에서 개인적인 사실을 건져 올리는 일뿐이다
// (memoryExtraction.ts).
//
// 전부 순수 함수다 — 틀려도 콘솔은 조용하고 화면에는 "뭔가" 뜨기 때문에(엉뚱한 급수, 엉뚱한
// 취약 한자) 사람이 눈치채기 어렵다. 그래서 learnerProfile.test.ts로 고정해뒀다.

import { JLPT_LEVELS, type JlptLevel } from "../types/jlpt";
import type { StudyEvent, StudyEventType } from "./learnerMemoryDb";

/** 한 급수를 "공부한 급수"로 인정하는 데 필요한 최소 항목 수. */
const LEVEL_EVIDENCE_THRESHOLD = 5;
/** 각 목록을 몇 개까지 보여줄지. 프롬프트에 넣을 것이므로 너무 길면 안 된다. */
const LIST_LIMIT = 6;

export interface KanjiScore {
  kanji: string;
  wrong: number;
  correct: number;
}

export interface LearnerProfile {
  /** 추정 어휘 수준. 근거가 모자라면 null — **모를 때 아무 값이나 찍지 않는다.** */
  levelGuess: JlptLevel | null;
  /** 어떻게 그 급수가 나왔는지 한 줄 설명(화면에도 보여준다). */
  levelBasis: string;
  /** 퀴즈에서 반복해서 틀린 한자. 틀린 횟수가 맞힌 횟수보다 많은 것만. */
  weakKanji: KanjiScore[];
  /** 꾸준히 맞히고 틀린 적 없는 한자. */
  strongKanji: string[];
  /** 문장을 읽다 뜻을 찾아본 단어 — "이 단어를 몰랐다"에 가장 가까운 신호다. */
  weakWords: string[];
  /** 작문 첨삭에서 지적받은 요지(최근 것부터). */
  strugglePoints: string[];
  /** 마지막에 공부한 것들 — 사람이 읽는 한 줄짜리 문장. */
  recentStudy: string[];
  totalEvents: number;
}

export const EMPTY_PROFILE: LearnerProfile = {
  levelGuess: null,
  levelBasis: "아직 학습 기록이 없어요.",
  weakKanji: [],
  strongKanji: [],
  weakWords: [],
  strugglePoints: [],
  recentStudy: [],
  totalEvents: 0,
};

/**
 * 어휘 수준 추정: **가장 어려운 급수 중, 근거가 충분히 쌓인 것**을 고른다.
 *
 * JLPT_LEVELS는 쉬운 쪽(N5)부터 어려운 쪽(N1) 순이라 뒤에서부터 훑는다. N1 항목을 두어 개
 * 건드려본 것만으로 "N1 학습자"라고 하면 선생님이 어려운 말로 설명하기 시작하므로, 급수당
 * LEVEL_EVIDENCE_THRESHOLD개를 넘겨야 인정한다. 하나도 못 넘기면 null을 준다 —
 * **근거가 없을 때 N5로 찍지 않는 게 중요하다.** 찍으면 선생님이 "초급이시니까"로 시작한다.
 */
export function guessLevel(events: StudyEvent[]): { level: JlptLevel | null; basis: string } {
  const counts = new Map<JlptLevel, Set<string>>();
  for (const event of events) {
    if (!event.level) continue;
    let seen = counts.get(event.level);
    if (!seen) {
      seen = new Set();
      counts.set(event.level, seen);
    }
    // 같은 한자를 열 번 틀린 건 "열 개를 공부했다"가 아니다 — 항목 단위로 센다.
    seen.add(event.subject);
  }

  for (let i = JLPT_LEVELS.length - 1; i >= 0; i -= 1) {
    const level = JLPT_LEVELS[i];
    const count = counts.get(level)?.size ?? 0;
    if (count >= LEVEL_EVIDENCE_THRESHOLD) {
      return { level, basis: `${level} 항목을 ${count}개 공부했어요.` };
    }
  }

  const total = [...counts.values()].reduce((sum, set) => sum + set.size, 0);
  if (total === 0) return { level: null, basis: "아직 급수를 알 수 있는 학습 기록이 없어요." };
  return {
    level: null,
    basis: `공부한 항목이 ${total}개뿐이라 아직 수준을 가늠하기 어려워요.`,
  };
}

/** 한자 퀴즈 정답/오답을 한자별로 합산한다. */
export function scoreKanji(events: StudyEvent[]): Map<string, KanjiScore> {
  const scores = new Map<string, KanjiScore>();
  for (const event of events) {
    if (event.type !== "kanji-quiz-correct" && event.type !== "kanji-quiz-wrong") continue;
    let score = scores.get(event.subject);
    if (!score) {
      score = { kanji: event.subject, wrong: 0, correct: 0 };
      scores.set(event.subject, score);
    }
    if (event.type === "kanji-quiz-wrong") score.wrong += 1;
    else score.correct += 1;
  }
  return scores;
}

/** 최신 순으로 훑으며 `subject`(또는 `detail`)를 중복 없이 모은다. */
function recentSubjects(events: StudyEvent[], types: StudyEventType[], pick: "subject" | "detail") {
  const wanted = new Set(types);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (!wanted.has(event.type)) continue;
    const value = (pick === "detail" ? event.detail : event.subject)?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= LIST_LIMIT) break;
  }
  return result;
}

/** 이벤트 하나를 "마지막에 공부한 것" 줄로 옮긴다. */
function describeEvent(event: StudyEvent): string | null {
  switch (event.type) {
    case "kanji-learned":
      return `한자 ${event.subject}를 학습 완료로 표시`;
    case "kanji-quiz-wrong":
      return `한자 ${event.subject} 읽기 퀴즈를 틀림`;
    case "kanji-quiz-correct":
      return `한자 ${event.subject} 읽기 퀴즈를 맞힘`;
    case "word-added":
      return `단어 ${event.subject}를 단어장에 추가`;
    case "word-looked-up":
      return `단어 ${event.subject}의 뜻을 찾아봄`;
    case "word-review-known":
      return `단어 ${event.subject} 복습에 성공`;
    case "writing-corrected":
      return `작문 첨삭을 받음: ${event.subject}`;
    case "writing-clean":
      return `작문에서 고칠 곳 없이 통과: ${event.subject}`;
    case "teacher-question":
      return `선생님에게 질문: ${event.subject}`;
    case "conversation-practice":
      return `${event.subject} 상황으로 회화 연습`;
    case "kana-studied":
      return `가나 ${event.subject} 발음을 들어봄`;
    default:
      return null;
  }
}

/**
 * `events`는 **최신이 앞**이라고 가정한다(`loadEvents`가 그렇게 준다).
 * 정렬을 바꾸면 "마지막에 공부한 것"이 조용히 뒤집히므로 순서를 믿지 말고 여기서 한 번 더
 * 정렬한다 — 호출하는 쪽이 늘어나도 결과가 흔들리지 않게.
 */
export function buildLearnerProfile(rawEvents: StudyEvent[]): LearnerProfile {
  if (rawEvents.length === 0) return EMPTY_PROFILE;
  const events = [...rawEvents].sort((a, b) => b.at - a.at);

  const { level, basis } = guessLevel(events);
  const scores = scoreKanji(events);

  const weakKanji = [...scores.values()]
    .filter((s) => s.wrong > s.correct)
    .sort((a, b) => b.wrong - a.wrong || b.correct - a.correct)
    .slice(0, LIST_LIMIT);

  const strongKanji = [...scores.values()]
    .filter((s) => s.wrong === 0 && s.correct >= 2)
    .sort((a, b) => b.correct - a.correct)
    .slice(0, LIST_LIMIT)
    .map((s) => s.kanji);

  const recentStudy: string[] = [];
  const seenDescriptions = new Set<string>();
  for (const event of events) {
    const line = describeEvent(event);
    if (!line || seenDescriptions.has(line)) continue;
    seenDescriptions.add(line);
    recentStudy.push(line);
    if (recentStudy.length >= LIST_LIMIT) break;
  }

  return {
    levelGuess: level,
    levelBasis: basis,
    weakKanji,
    strongKanji,
    weakWords: recentSubjects(events, ["word-looked-up"], "subject"),
    // 첨삭에서 지적받은 요지는 subject(원문)가 아니라 detail에 넣는다.
    strugglePoints: recentSubjects(events, ["writing-corrected"], "detail"),
    recentStudy,
    totalEvents: events.length,
  };
}
