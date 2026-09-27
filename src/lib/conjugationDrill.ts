// 단어장의 동사로 내는 활용 연습. **LLM을 쓰지 않는다** — 정답은 verbConjugation.ts가 규칙으로
// 계산하므로 채점도 정확하다(선생님 "연습해보기"처럼 AI 재확인이 필요 없다).

import type { WordEntry } from "../types/dictionary";
import { normalizeAnswer } from "./teacherPractice";
import { VERB_FORMS, conjugateVerb, type VerbConjugation, type VerbForm } from "./verbConjugation";

export const DRILL_LENGTH = 10;

export interface DrillQuestion {
  entry: WordEntry;
  form: VerbForm;
  answer: VerbConjugation;
}

/** 활용 연습에 낼 수 있는 동사인가(활용형이 하나라도 계산되는가). */
export function isDrillableVerb(entry: WordEntry): boolean {
  return VERB_FORMS.some((form) => conjugateVerb(entry, form) !== null);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * (동사, 활용형) 쌍을 섞어 최대 `length`문제를 낸다.
 *
 * **같은 쌍은 두 번 내지 않고, 동사를 먼저 고르게 돈다.** 쌍 전체를 그냥 섞으면 동사가 몇 개
 * 없을 때 한 동사가 연달아 나오거나, 동사가 많을 때 한 단어만 여러 번 걸린다. 그래서 동사를
 * 섞어 한 바퀴에 한 번씩 돌리고, 바퀴마다 그 동사의 아직 안 낸 활용형 하나를 뽑는다.
 */
export function buildConjugationDrill(
  entries: WordEntry[],
  length = DRILL_LENGTH,
  random: () => number = Math.random
): DrillQuestion[] {
  const pools = shuffle(entries, random)
    .map((entry) => ({
      entry,
      rows: shuffle(
        VERB_FORMS.map((form) => conjugateVerb(entry, form)).filter((r): r is VerbConjugation => r !== null),
        random
      ),
    }))
    .filter((p) => p.rows.length > 0);

  const questions: DrillQuestion[] = [];
  while (questions.length < length && pools.some((p) => p.rows.length > 0)) {
    for (const pool of pools) {
      if (questions.length >= length) break;
      const row = pool.rows.pop();
      if (row) questions.push({ entry: pool.entry, form: row.form, answer: row });
    }
  }
  return questions;
}

/**
 * 채점. 선생님 연습 문제와 같은 정규화(`normalizeAnswer` — NFKC·공백/구두점 제거·가타카나와
 * 로마자를 히라가나로)를 거쳐 **읽기나 표기 중 하나와 같으면** 맞다. 한자로 쳐도(食べない),
 * 가나로 쳐도(たべない), 로마자로 쳐도(tabenai) 맞다.
 */
export function isConjugationCorrect(input: string, answer: VerbConjugation): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  const accepted = [answer.kanji, answer.reading].filter((v): v is string => Boolean(v)).map(normalizeAnswer);
  return accepted.includes(got);
}
