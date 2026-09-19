import { useEffect, useMemo, useState } from "react";
import { findUnit, loadCurriculum } from "../lib/curriculum";
import { buildCurriculumPlan, type CurriculumPlan } from "../lib/curriculumProgress";
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
