// 학습 달력의 계산. **전부 순수 함수**다(studyCalendar.test.ts가 고정한다).
//
// 근거는 둘이다:
//  1. 날짜별 XP(`gamificationStore.dailyXp`) — XP는 모든 학습 행동이 `recordProgress` 한 곳으로
//     들어오므로(단어 복습·문장 복습·한자 쓰기·활용 연습처럼 학습 기록을 안 남기는 것까지) 가장
//     빠짐없는 근거다. 다만 이 기능이 생긴 뒤부터만 쌓인다.
//  2. 학습 기록(IndexedDB 이벤트) — 그 전 날짜를 채우고, "그날 무엇을 했나"를 보여준다. 최근
//     1000개만 남으므로(`MAX_EVENTS`) 아주 오래된 날은 비어 보일 수 있다.
//
// 날짜는 전부 **로컬 타임존** `YYYY-MM-DD`다. UTC로 자르면 한국 오전 9시 전 공부가 전날 칸에
// 찍힌다 — 콘솔은 조용하고 달력만 하루씩 밀린다.

export type ActivityCategory = "kana" | "kanji" | "word" | "writing" | "teacher" | "conversation";

export type DayActivity = {
  xp: number;
  counts: Partial<Record<ActivityCategory, number>>;
};

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  kana: "오십음도",
  kanji: "한자",
  word: "단어",
  writing: "작문",
  teacher: "선생님 질문",
  conversation: "회화",
};

const CATEGORY_ORDER: ActivityCategory[] = ["kana", "kanji", "word", "writing", "conversation", "teacher"];

/** 이벤트 종류 → 달력에서 묶어 보여줄 갈래. 모르는 종류는 센다 해도 보여줄 이름이 없어 버린다. */
export function categoryOf(type: string): ActivityCategory | null {
  if (type === "kana-studied") return "kana";
  if (type.startsWith("kanji-")) return "kanji";
  if (type.startsWith("word-")) return "word";
  if (type.startsWith("writing-")) return "writing";
  if (type === "teacher-question") return "teacher";
  if (type === "conversation-practice") return "conversation";
  return null;
}

/** 시각(ms) → 로컬 `YYYY-MM-DD`. */
export function dateKeyOfTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 날짜별 활동을 합친다. `dailyXp`는 localStorage(=백업 파일)에서 온 값이라 모양을 믿지 않는다 —
 * 날짜 모양이 아닌 키·양수가 아닌 값은 버린다.
 */
export function buildActivityByDay(
  dailyXp: unknown,
  events: readonly { at: number; type: string }[]
): Record<string, DayActivity> {
  const byDay: Record<string, DayActivity> = {};
  const day = (key: string) => (byDay[key] ??= { xp: 0, counts: {} });

  if (dailyXp && typeof dailyXp === "object" && !Array.isArray(dailyXp)) {
    for (const [key, value] of Object.entries(dailyXp)) {
      if (!DATE_KEY.test(key) || typeof value !== "number" || !(value > 0)) continue;
      day(key).xp += value;
    }
  }
  for (const event of events) {
    const category = categoryOf(event.type);
    if (!category || !Number.isFinite(event.at)) continue;
    const counts = day(dateKeyOfTime(event.at)).counts;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return byDay;
}

/** 그날 무엇이든 했나. */
export function isStudyDay(activity: DayActivity | undefined): boolean {
  if (!activity) return false;
  return activity.xp > 0 || Object.values(activity.counts).some((n) => (n ?? 0) > 0);
}

/**
 * 칸 색의 진하기(0~4). XP가 기준이고, XP 기록이 없는 옛날 날(기록만 있는 날)은 1로 친다 —
 * 공부한 건 확실하지만 얼마나 했는지는 모른다.
 */
export function activityLevel(activity: DayActivity | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!isStudyDay(activity)) return 0;
  const xp = activity!.xp;
  if (xp >= 100) return 4;
  if (xp >= 50) return 3;
  if (xp >= 20) return 2;
  return 1;
}

/** 그날 한 일을 한 줄로("한자 3 · 단어 5"). 이벤트가 없으면 빈 배열. */
export function describeDay(activity: DayActivity | undefined): string[] {
  if (!activity) return [];
  return CATEGORY_ORDER.filter((c) => (activity.counts[c] ?? 0) > 0).map(
    (c) => `${CATEGORY_LABEL[c]} ${activity.counts[c]}`
  );
}

/**
 * 한 달의 칸. 일요일 시작 주 단위이고, 그달이 아닌 칸은 null이다. `month`는 1~12.
 */
export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 달 이동. 12월 다음은 이듬해 1월이다. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** 그달에 공부한 날 수와 XP 합. */
export function summarizeMonth(
  byDay: Record<string, DayActivity>,
  year: number,
  month: number
): { studyDays: number; xp: number } {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  let studyDays = 0;
  let xp = 0;
  for (const [key, activity] of Object.entries(byDay)) {
    if (!key.startsWith(prefix) || !isStudyDay(activity)) continue;
    studyDays++;
    xp += activity.xp;
  }
  return { studyDays, xp };
}

/**
 * 가장 길게 이어서 공부한 날 수. 날짜끼리 하루씩 더해 가며 본다 — 문자열로 이웃을 따지면 달·해가
 * 바뀌는 날(1월 31일 → 2월 1일) 끊긴다.
 */
export function longestStreak(byDay: Record<string, DayActivity>): number {
  const keys = Object.keys(byDay)
    .filter((k) => isStudyDay(byDay[k]))
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of keys) {
    run = prev !== null && nextDayKey(prev) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKeyOfTime(new Date(y, m - 1, d + 1).getTime());
}
