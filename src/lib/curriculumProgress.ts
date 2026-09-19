// 학습 기록을 커리큘럼 위에 얹어 "지금 어느 유닛이고 얼마나 왔는지"를 계산한다.
//
// **전부 순수 함수이고 LLM을 쓰지 않는다.** 진도는 세면 나오는 값이라 이 프로젝트 규칙
// 그대로다(learnerProfile.ts와 같은 이유). 그리고 조용히 틀리는 종류다 — 어긋나도 화면에는
// 그럴듯한 퍼센트가 뜨고, 사용자는 엉뚱한 유닛을 공부하게 된다. curriculumProgress.test.ts가
// 고정한다.
//
// **kanji.json / dictionary.json을 import하지 않는다.** 대문 카드가 이 계산을 쓰는데,
// 여기서 사전이나 한자 데이터를 끌어오면 진입 청크가 MB 단위로 불어난다.

import type { StudyEvent } from "./learnerMemoryDb";
import { unitKey } from "./curriculum";
import { CURRICULUM_LEVELS, type Curriculum, type CurriculumLevelId, type CurriculumUnit } from "../types/curriculum";

/**
 * 커리큘럼의 kanjiFocus에 있지만 `kanji.json`에는 없는 글자들.
 *
 * kanji.json은 JLPT 범위(2,135자)만 담고 있어서 이 세 글자는 앱에서 **학습할 방법이 아예
 * 없다.** 총계에 넣어두면 해당 유닛이 영원히 100%가 되지 않아 자동 완료가 막히므로 뺀다.
 *
 * 하드코딩인 이유: 이 목록을 계산하려면 kanji.json(444KB)을 import해야 하는데, 그러면 대문
 * 진입 청크가 그만큼 무거워진다. 대신 `curriculumProgress.test.ts`가 실제 데이터와 대조해
 * 어긋나면 실패하므로, 커리큘럼이나 kanji.json이 바뀌면 테스트가 잡아준다.
 */
export const KANJI_NOT_IN_APP = new Set(["於", "譬", "俟"]);

export interface UnitProgress {
  key: string;
  level: CurriculumLevelId;
  unitNumber: number;
  title: string;
  canDoGoals: string[];
  /** 이 유닛에서 익힐 한자 중 이미 아는 것 / 아직 안 한 것 (앱에 없는 글자는 빠져 있다). */
  kanjiDone: string[];
  kanjiTodo: string[];
  /** Pre-N5 유닛의 가나. */
  kanaDone: string[];
  kanaTodo: string[];
  wordsDone: number;
  wordsTarget: number;
  /** 0~1. 한자·가나·단어 중 이 유닛에 해당하는 항목만 평균한다. */
  ratio: number;
  complete: boolean;
  /** 사용자가 "이미 아는 내용이에요"로 직접 넘긴 유닛인가. */
  manual: boolean;
}

export interface CurriculumPlan {
  /** 지금 해야 할 유닛. 커리큘럼을 전부 끝냈으면 null. */
  current: UnitProgress | null;
  /** 시작 단계부터 끝까지, 쉬운 순서대로. */
  units: UnitProgress[];
  completedCount: number;
  totalCount: number;
}

export interface ProgressInput {
  events: StudyEvent[];
  /** kanjiProgressStore의 "학습 완료" 목록. */
  learnedKanji: string[];
  /** 사용자가 직접 완료 처리한 유닛 키. */
  manualUnits: string[];
  /** 대문에서 고른 시작 단계. 이보다 쉬운 단계는 진도에서 아예 제외한다. */
  startLevel: CurriculumLevelId;
}

/** 한자를 "안다"고 볼 조건: 학습 완료로 표시했거나, 퀴즈에서 맞힌 적이 있다. */
function knownKanji(input: ProgressInput): Set<string> {
  const known = new Set(input.learnedKanji);
  for (const event of input.events) {
    if (event.type === "kanji-learned" || event.type === "kanji-quiz-correct") known.add(event.subject);
  }
  return known;
}

function studiedKana(events: StudyEvent[]): Set<string> {
  const kana = new Set<string>();
  for (const event of events) {
    if (event.type === "kana-studied") kana.add(event.subject);
  }
  return kana;
}

/**
 * 급수별로 "학습자가 건드려 본 서로 다른 단어"의 개수.
 *
 * 단어를 유닛에 직접 묶을 방법이 없어서(커리큘럼의 `vocabThemes`에 해당하는 필드가
 * dictionary.json에 **없다**) 급수 단위로 세고, 유닛마다 할당량을 순서대로 떼어 쓴다.
 */
function wordCountByLevel(events: StudyEvent[]): Map<string, Set<string>> {
  const byLevel = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.type !== "word-added" && event.type !== "word-review-known" && event.type !== "word-looked-up") {
      continue;
    }
    if (!event.level) continue;
    let seen = byLevel.get(event.level);
    if (!seen) {
      seen = new Set();
      byLevel.set(event.level, seen);
    }
    seen.add(event.subject);
  }
  return byLevel;
}

/** Pre-N5 유닛은 커리큘럼이 단어를 직접 들고 있으므로 그 표기로 맞춰 센다. */
function matchedVocabItems(unit: CurriculumUnit, events: StudyEvent[]): number {
  const items = unit.vocabItems ?? [];
  if (items.length === 0) return 0;
  const touched = new Set(
    events
      .filter((e) => e.type === "word-added" || e.type === "word-review-known" || e.type === "word-looked-up")
      .map((e) => e.subject)
  );
  return items.filter((item) => touched.has(item.word) || touched.has(item.reading)).length;
}

function ratioOf(parts: { done: number; total: number }[]): number {
  const active = parts.filter((p) => p.total > 0);
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, p) => acc + Math.min(1, p.done / p.total), 0);
  return sum / active.length;
}

export function buildCurriculumPlan(curriculum: Curriculum, input: ProgressInput): CurriculumPlan {
  const known = knownKanji(input);
  const kana = studiedKana(input.events);
  const wordsByLevel = wordCountByLevel(input.events);
  const manual = new Set(input.manualUnits);

  const startIndex = CURRICULUM_LEVELS.indexOf(input.startLevel);
  const units: UnitProgress[] = [];
  // 급수별로 앞 유닛들이 이미 가져간 단어 할당량. 같은 급수의 유닛을 순서대로 돌며 누적한다.
  const quotaUsed = new Map<string, number>();

  for (const levelId of CURRICULUM_LEVELS) {
    // 시작 단계보다 쉬운 단계는 건너뛴다 — N3부터 시작한 사람에게 히라가나를 시키지 않는다.
    if (startIndex >= 0 && CURRICULUM_LEVELS.indexOf(levelId) < startIndex) continue;
    const level = curriculum.levels.find((l) => l.level === levelId);
    if (!level) continue;

    for (const unit of [...level.units].sort((a, b) => a.unitNumber - b.unitNumber)) {
      const focus = (unit.kanjiFocus ?? []).filter((k) => !KANJI_NOT_IN_APP.has(k));
      const kanjiDone = focus.filter((k) => known.has(k));
      const kanjiTodo = focus.filter((k) => !known.has(k));

      const kanaFocus = unit.kanaFocus ?? [];
      const kanaDone = kanaFocus.filter((k) => kana.has(k));
      const kanaTodo = kanaFocus.filter((k) => !kana.has(k));

      let wordsTarget = 0;
      let wordsDone = 0;
      if (unit.vocabQuery) {
        const vocabLevel = unit.vocabQuery.jlptLevel;
        wordsTarget = unit.vocabQuery.recommendedCount;
        const used = quotaUsed.get(vocabLevel) ?? 0;
        const total = wordsByLevel.get(vocabLevel)?.size ?? 0;
        wordsDone = Math.max(0, Math.min(wordsTarget, total - used));
        quotaUsed.set(vocabLevel, used + wordsTarget);
      } else if ((unit.vocabItems ?? []).length > 0) {
        wordsTarget = (unit.vocabItems ?? []).length;
        wordsDone = matchedVocabItems(unit, input.events);
      }

      const key = unitKey(levelId, unit.unitNumber);
      const isManual = manual.has(key);
      const ratio = isManual
        ? 1
        : ratioOf([
            { done: kanjiDone.length, total: focus.length },
            { done: kanaDone.length, total: kanaFocus.length },
            { done: wordsDone, total: wordsTarget },
          ]);

      units.push({
        key,
        level: levelId,
        unitNumber: unit.unitNumber,
        title: unit.title,
        canDoGoals: unit.canDoGoals,
        kanjiDone,
        kanjiTodo,
        kanaDone,
        kanaTodo,
        wordsDone,
        wordsTarget,
        ratio,
        // 자동 완료는 "해당하는 항목을 전부 채웠을 때"만. 애매한 기준(80% 등)으로 두면
        // 아직 못 본 한자가 남은 채로 다음 유닛이 열린다.
        complete: isManual || ratio >= 1,
        manual: isManual,
      });
    }
  }

  return {
    // 맨 앞의 "아직 안 끝난" 유닛이 곧 지금 할 일이다. 뒤쪽 유닛을 먼저 끝냈더라도
    // 건너뛴 앞 유닛으로 되돌려 보낸다 — 커리큘럼은 순서가 있는 물건이다.
    current: units.find((u) => !u.complete) ?? null,
    units,
    completedCount: units.filter((u) => u.complete).length,
    totalCount: units.length,
  };
}
