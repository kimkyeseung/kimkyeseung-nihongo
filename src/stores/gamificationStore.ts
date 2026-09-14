import { create } from "zustand";
import { persist } from "zustand/middleware";

function todayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface GamificationState {
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  /** 학습 행동이 있을 때마다 호출한다: XP를 더하고 연속 학습일(스트릭)을 갱신한다. */
  recordProgress: (xpAmount: number) => void;
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set) => ({
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      recordProgress: (xpAmount) =>
        set((state) => {
          const today = todayKey();
          let streak = state.streak;
          if (state.lastActiveDate === today) {
            // 오늘 이미 활동을 기록했으면 스트릭은 그대로 둔다.
          } else if (state.lastActiveDate === todayKey(-1)) {
            streak = state.streak + 1;
          } else {
            streak = 1;
          }
          return { xp: state.xp + xpAmount, streak, lastActiveDate: today };
        }),
    }),
    { name: "gamification" }
  )
);
