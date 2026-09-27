import { create } from "zustand";
import { persist } from "zustand/middleware";
// 선생님 인사(pageStateStore의 useTeacherGreeting)와 같은 날짜 기준을 써야 해서 공용으로 뺐다.
import { localDateKey as todayKey } from "../lib/localDate";

interface GamificationState {
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  /**
   * 날짜(로컬 `YYYY-MM-DD`)별로 얻은 XP — 학습 달력의 근거다. 모든 학습 행동이 여기 한 곳으로
   * 들어오므로 학습 기록(IndexedDB)을 안 남기는 행동(단어·문장 복습, 한자 쓰기…)까지 잡힌다.
   * 공부한 날마다 키 하나라 몇 년 써도 몇 KB다. 이 필드 전에 만든 저장값에는 없다 — persist의
   * 기본 병합이 초기값 `{}`을 남긴다.
   */
  dailyXp: Record<string, number>;
  /** 학습 행동이 있을 때마다 호출한다: XP를 더하고 연속 학습일(스트릭)을 갱신한다. */
  recordProgress: (xpAmount: number) => void;
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set) => ({
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      dailyXp: {},
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
          // 백업에서 되돌린 값이 망가져 있어도 여기서 죽지 않게 객체인지 확인한다.
          const daily = state.dailyXp && typeof state.dailyXp === "object" ? state.dailyXp : {};
          const dailyXp = { ...daily, [today]: (Number(daily[today]) || 0) + xpAmount };
          return { xp: state.xp + xpAmount, streak, lastActiveDate: today, dailyXp };
        }),
    }),
    { name: "gamification" }
  )
);
