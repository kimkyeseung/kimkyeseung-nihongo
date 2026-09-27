import { useMemo, useState } from "react";
import { localDateKey, formatDayLabel } from "../lib/localDate";
import {
  activityLevel,
  buildActivityByDay,
  buildMonthGrid,
  describeDay,
  longestStreak,
  shiftMonth,
  summarizeMonth,
} from "../lib/studyCalendar";
import { useGamificationStore } from "../stores/gamificationStore";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 진하기별 칸 색. 0은 빈 날.
const LEVEL_CLASS = [
  "bg-gray-50 text-gray-400",
  "bg-primary/20 text-gray-700",
  "bg-primary/45 text-gray-800",
  "bg-primary/70 text-white",
  "bg-primary text-white",
] as const;

/**
 * 학습 달력(뱃지 시트 안). 한 달을 칸으로 보여주고, 공부한 날일수록 진한 초록이다. 칸을 누르면
 * 그날 얻은 XP와 한 일을 아래에 적는다. 계산은 전부 studyCalendar.ts.
 *
 * "오늘"은 시트를 연 순간에 잡는다(렌더마다 `new Date()`를 부르지 않는다 — 스트릭·인사와 같은
 * localDate 기준).
 */
function StudyCalendar() {
  const dailyXp = useGamificationStore((s) => s.dailyXp);
  const events = useLearnerMemoryStore((s) => s.events);
  const [today] = useState(() => localDateKey());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m };
  });
  const [selected, setSelected] = useState<string | null>(today);

  const byDay = useMemo(() => buildActivityByDay(dailyXp, events), [dailyXp, events]);
  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const month = summarizeMonth(byDay, cursor.year, cursor.month);
  const best = useMemo(() => longestStreak(byDay), [byDay]);

  const [ty, tm] = today.split("-").map(Number);
  const isCurrentMonth = cursor.year === ty && cursor.month === tm;
  const selectedActivity = selected ? byDay[selected] : undefined;
  const selectedDetail = describeDay(selectedActivity);

  function move(delta: number) {
    setCursor((c) => shiftMonth(c.year, c.month, delta));
    setSelected(null);
  }

  return (
    <section className="mt-4 rounded-2xl border-2 border-gray-100 p-3" aria-label="학습 달력">
      <div className="flex items-center justify-between">
        <button onClick={() => move(-1)} className="rounded-full px-3 py-1 text-gray-400" aria-label="이전 달">
          ‹
        </button>
        <p className="font-bold text-gray-700">
          {cursor.year}년 {cursor.month}월
        </p>
        <button
          onClick={() => move(1)}
          disabled={isCurrentMonth}
          className="rounded-full px-3 py-1 text-gray-400 disabled:opacity-30"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((key, i) => {
          if (!key) return <span key={`blank-${i}`} />;
          const level = activityLevel(byDay[key]);
          const future = key > today;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              disabled={future}
              aria-label={`${key}${level > 0 ? " 공부함" : ""}`}
              aria-pressed={selected === key}
              className={`aspect-square rounded-lg text-xs ${future ? "text-gray-200" : LEVEL_CLASS[level]} ${
                key === today ? "ring-2 ring-warning" : ""
              } ${selected === key ? "outline outline-2 outline-offset-1 outline-info" : ""}`}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        이번 달 {month.studyDays}일 공부 · ⭐ {month.xp} XP · 최장 연속 {best}일
      </p>

      {selected && (
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-sm" aria-live="polite">
          <p className="font-bold text-gray-700">{formatDayLabel(selected, today)}</p>
          {activityLevel(selectedActivity) === 0 ? (
            <p className="text-gray-400">이날은 기록이 없어요.</p>
          ) : (
            <p className="text-gray-600">
              {selectedActivity!.xp > 0 && `⭐ ${selectedActivity!.xp} XP`}
              {selectedActivity!.xp > 0 && selectedDetail.length > 0 && " · "}
              {selectedDetail.join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default StudyCalendar;
