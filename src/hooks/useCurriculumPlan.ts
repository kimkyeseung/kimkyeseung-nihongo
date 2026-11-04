import { useEffect, useMemo, useState } from "react";
import { findUnit, levelLabel, loadCurriculum } from "../lib/curriculum";
import { buildCurriculumPlan, type CurriculumPlan } from "../lib/curriculumProgress";
import { buildDailyPlan, type PlanAction } from "../lib/dailyPlan";
import { buildLessonSteps, lessonStepPath, nextLessonStep } from "../lib/lessonPlan";
import type { Curriculum, CurriculumUnit } from "../types/curriculum";
import { useCurriculumStore } from "../stores/curriculumStore";
import { useKanjiProgressStore } from "../stores/kanjiProgressStore";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";

/**
 * 커리큘럼 데이터를 한 번만 받아온다. 동적 import라 첫 호출에 한 박자 걸리고, 그 전에는
 * null이다 — **null일 때 "진도 없음"으로 단정하지 말 것**(useAiCapability와 같은 함정).
 *
 * `use()` + Suspense를 쓰지 않은 이유: 이걸 쓰는 대문(`/`)은 Layout 밖이라
 * `AnimatedOutlet`의 Suspense 경계 안에 있지 않다.
 */
export function useCurriculum(): Curriculum | null {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  useEffect(() => {
    let alive = true;
    loadCurriculum().then((c) => {
      if (alive) setCurriculum(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return curriculum;
}

export interface CurriculumPlanResult {
  curriculum: Curriculum;
  plan: CurriculumPlan;
  /** 지금 해야 할 유닛의 원본 데이터(문법 포인트 등). 다 끝냈으면 undefined. */
  currentUnit: CurriculumUnit | undefined;
}

/**
 * 지금 진도를 계산해서 돌려준다. 준비가 안 됐으면 null —
 * 커리큘럼을 아직 못 받았거나, 기억(IndexedDB)을 아직 못 읽었거나, 시작 단계를 아직 안 고른 경우다.
 */
export function useCurriculumPlan(): CurriculumPlanResult | null {
  const curriculum = useCurriculum();
  const memoryLoaded = useLearnerMemoryStore((s) => s.loaded);
  const events = useLearnerMemoryStore((s) => s.events);
  const learnedKanji = useKanjiProgressStore((s) => s.learned);
  const startLevel = useCurriculumStore((s) => s.startLevel);
  const manualUnits = useCurriculumStore((s) => s.manualUnits);

  return useMemo(() => {
    if (!curriculum || !memoryLoaded || !startLevel) return null;
    const plan = buildCurriculumPlan(curriculum, { events, learnedKanji, manualUnits, startLevel });
    const current = plan.current;
    return {
      curriculum,
      plan,
      currentUnit: current ? findUnit(curriculum, current.level, current.unitNumber) : undefined,
    };
  }, [curriculum, memoryLoaded, events, learnedKanji, manualUnits, startLevel]);
}

/**
 * 지금 수업의 다음 단계 — "수업 시작" 버튼들(대문·로드맵·진단 결과)이 같은 곳을 가리키게 한 곳에서 계산한다.
 * 진도를 아직 못 읽었거나 커리큘럼을 다 끝냈으면 null.
 */
export function useLessonEntry(): {
  to: string;
  /** "N5 · 1단원 인사와 자기소개" — 버튼에는 단계가 아니라 단원을 적는다(`planHomeStart` 주석). */
  unitLabel: string;
  /** 이번 단원 목표 첫 줄 */
  goal: string | null;
  startsWithKana: boolean;
} | null {
  const result = useCurriculumPlan();
  const taught = useCurriculumStore((s) => s.taughtGrammar);
  return useMemo(() => {
    const current = result?.plan.current;
    if (!current || !result?.currentUnit) return null;
    const next = nextLessonStep(buildLessonSteps(current, result.currentUnit, taught));
    if (!next) return null;
    const level = result.curriculum.levels.find((l) => l.level === current.level);
    return {
      to: lessonStepPath(next),
      unitLabel: `${level ? levelLabel(level) : current.level} · ${current.unitNumber}단원 ${current.title}`,
      goal: current.canDoGoals[0] ?? null,
      startsWithKana: next.key.endsWith(":kana"),
    };
  }, [result, taught]);
}

/**
 * 오늘의 추천 목록. 대문의 시작 버튼과 "오늘의 학습" 카드가 같은 목록을 봐야 해서 한 곳에 뒀다.
 * 진도가 아직 없으면 null이다.
 */
export function useTodayActions(): PlanAction[] | null {
  const result = useCurriculumPlan();
  const profile = useLearnerMemoryStore((s) => s.profile);
  return useMemo(
    () => (result ? buildDailyPlan(result.plan.current, result.currentUnit, profile) : null),
    [result, profile]
  );
}
