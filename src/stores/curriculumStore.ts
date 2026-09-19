import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CurriculumLevelId } from "../types/curriculum";

interface CurriculumState {
  /**
   * 대문에서 고른 시작 단계. **null은 "아직 안 물어봤다"는 뜻**이고, 이때만 대문이
   * 시작 단계를 묻는다. 기본값을 "Pre-N5"로 두면 안 된다 — 이미 N3인 사람이 앱을 켜자마자
   * 히라가나부터 하라는 화면을 보게 된다.
   */
  startLevel: CurriculumLevelId | null;
  /**
   * 사용자가 "이미 아는 내용이에요"로 직접 넘긴 유닛 키(`"N5-3"` 형식).
   * 자동 완료는 학습 기록에서 매번 다시 계산하므로 저장하지 않는다 — 저장하면 기록을
   * 지웠을 때 진도만 남아 둘이 어긋난다.
   */
  manualUnits: string[];
  setStartLevel: (level: CurriculumLevelId) => void;
  toggleManualUnit: (key: string) => void;
  isManual: (key: string) => boolean;
}

export const useCurriculumStore = create<CurriculumState>()(
  persist(
    (set, get) => ({
      startLevel: null,
      manualUnits: [],
      setStartLevel: (startLevel) => set({ startLevel }),
      toggleManualUnit: (key) =>
        set((state) => ({
          manualUnits: state.manualUnits.includes(key)
            ? state.manualUnits.filter((k) => k !== key)
            : [...state.manualUnits, key],
        })),
      isManual: (key) => get().manualUnits.includes(key),
    }),
    { name: "curriculum" }
  )
);
