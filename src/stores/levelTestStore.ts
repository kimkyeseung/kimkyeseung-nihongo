import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addRecord, canEarnDiagnosisXp, parseRecords, type LevelTestRecord } from "../lib/levelTest/history";

/**
 * 레벨 진단 결과(최근 3번의 요약). **학습 이력이라 백업에 담는다**(`backup.ts`의 `BACKUP_LOCAL_KEYS`).
 * 문제별 결과는 저장하지 않는다 — 진단은 일부러 실력 위 급수를 묻는 시험이라, 틀린 N1 단어를 "약한
 * 단어"로 넣으면 `/review`가 엉뚱한 단어로 찬다(학습 기록에 안 넣는 것과 같은 이유).
 *
 * 저장값은 백업 파일에서도 돌아오므로 불러올 때 `parseRecords`로 검사한다(`merge`). 여기서 나온 급수
 * 문자열이 선생님 시스템 프롬프트에 들어간다.
 */
interface LevelTestState {
  records: LevelTestRecord[];
  /** 진단 XP를 마지막으로 받은 날(YYYY-MM-DD) — 하루 한 번까지만 준다 */
  lastXpDay: string | null;
  /**
   * 기록을 남긴다. `added`는 처음 들어간 기록인지(같은 진단을 두 번 넣지 않는다 — StrictMode·페이지 재진입),
   * `xp`는 그러면서 오늘 아직 진단 XP를 안 받았는지. XP는 부르는 쪽이 준다.
   */
  addResult: (record: LevelTestRecord, todayKey: string) => { added: boolean; xp: boolean };
}

export const useLevelTestStore = create<LevelTestState>()(
  persist(
    (set, get) => ({
      records: [],
      lastXpDay: null,
      addResult: (record, todayKey) => {
        const { records, lastXpDay } = get();
        if (records.some((r) => r.takenAt === record.takenAt)) return { added: false, xp: false };
        const xp = canEarnDiagnosisXp(lastXpDay, todayKey);
        set({ records: addRecord(records, record), lastXpDay: xp ? todayKey : lastXpDay });
        return { added: true, xp };
      },
    }),
    {
      name: "level-test",
      partialize: (s) => ({ records: s.records, lastXpDay: s.lastXpDay }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        return {
          ...current,
          records: parseRecords(p.records),
          lastXpDay: typeof p.lastXpDay === "string" ? p.lastXpDay : null,
        };
      },
    },
  ),
);
