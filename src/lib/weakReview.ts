// "약한 것 모아 풀기"에 낼 한자·단어를 학습 기록에서 고른다. **LLM을 쓰지 않는다** — 뭘 틀렸고
// 뭘 몰랐는지는 기록을 세면 나온다(learnerProfile.ts와 같은 규칙). 전부 순수 함수이고
// weakReview.test.ts가 고정한다: 틀려도 콘솔은 조용하고, 다 익힌 단어가 계속 나오거나 방금 틀린
// 한자가 빠질 뿐이다.
//
// 대문 "오늘의 학습"·/memory·풀기 시트가 **같은 목록**을 봐야 해서 프로필(`reviewTargets`)에
// 넣어 둔다 — 셋이 각자 세면 "약한 것 3개"라더니 열어보니 5문제인 식으로 어긋난다.

import type { JlptLevel } from "../types/jlpt";
import type { StudyEvent } from "./learnerMemoryDb";

/** 한 번에 모으는 개수. 풀기 시트가 한 세트(10문제)로 낼 만큼만. */
export const REVIEW_KANJI_LIMIT = 5;
export const REVIEW_WORD_LIMIT = 5;

export interface ReviewWord {
  /** 표기(이벤트의 subject). 사전에서 다시 찾을 열쇠다. */
  word: string;
  /** 뜻을 찾아볼 때 같이 남긴 읽기 — 표기가 같은 다른 단어와 가를 때 쓴다. */
  reading?: string;
  level?: JlptLevel;
}

export interface ReviewTargets {
  kanji: string[];
  words: ReviewWord[];
}

export const NO_REVIEW_TARGETS: ReviewTargets = { kanji: [], words: [] };

/**
 * 약한 한자·단어를 **최근에 약했던 순**으로 고른다. `events`는 순서를 믿지 않고 여기서 정렬한다.
 *
 * - 한자: 읽기 퀴즈에서 **틀린 횟수가 맞힌 횟수보다 많거나, 마지막에 틀렸으면** 약하다. 마지막에
 *   틀렸는데 전체로는 맞힌 게 많다고 빼면, 방금 틀린 글자가 목록에 안 나온다.
 * - 단어: **그 단어에 마지막으로 일어난 일**로 판단한다. 복습에서 "모르겠어요"를 했거나 문장에서
 *   뜻을 찾아봤으면 약하고, 그 뒤에 복습에서 "알아요"를 했으면 빠진다. 누적으로 세면 한 번 몰랐던
 *   단어가 다 익힌 뒤에도 영영 나온다. "모르겠어요"가 "찾아봄"보다 강한 신호라 먼저 놓는다.
 */
export function collectReviewTargets(rawEvents: StudyEvent[]): ReviewTargets {
  const events = [...rawEvents].sort((a, b) => a.at - b.at); // 오래된 것부터

  const kanji = new Map<string, { wrong: number; correct: number; lastWrong: boolean; at: number }>();
  const words = new Map<string, { state: "unknown" | "looked-up" | "known"; at: number; word: ReviewWord }>();

  for (const e of events) {
    if (e.type === "kanji-quiz-wrong" || e.type === "kanji-quiz-correct") {
      const s = kanji.get(e.subject) ?? { wrong: 0, correct: 0, lastWrong: false, at: 0 };
      const wrong = e.type === "kanji-quiz-wrong";
      if (wrong) s.wrong++;
      else s.correct++;
      s.lastWrong = wrong;
      s.at = e.at;
      kanji.set(e.subject, s);
    } else if (e.type === "word-review-unknown" || e.type === "word-looked-up" || e.type === "word-review-known") {
      const prev = words.get(e.subject);
      const state = e.type === "word-review-unknown" ? "unknown" : e.type === "word-looked-up" ? "looked-up" : "known";
      words.set(e.subject, {
        state,
        at: e.at,
        word: {
          word: e.subject,
          // 뜻을 찾아볼 때만 읽기가 남는다 — 복습 기록에는 없으니 앞서 남은 걸 이어받는다.
          reading: e.type === "word-looked-up" ? e.detail : prev?.word.reading,
          level: e.level ?? prev?.word.level,
        },
      });
    }
  }

  const weakKanji = [...kanji.entries()]
    .filter(([, s]) => s.wrong > s.correct || s.lastWrong)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, REVIEW_KANJI_LIMIT)
    .map(([char]) => char);

  const rank = { unknown: 0, "looked-up": 1 } as const;
  const weakWords = [...words.values()]
    .filter((w): w is typeof w & { state: "unknown" | "looked-up" } => w.state !== "known")
    .sort((a, b) => rank[a.state] - rank[b.state] || b.at - a.at)
    .slice(0, REVIEW_WORD_LIMIT)
    .map((w) => w.word);

  return { kanji: weakKanji, words: weakWords };
}

export function reviewTargetCount(targets: ReviewTargets): number {
  return targets.kanji.length + targets.words.length;
}
