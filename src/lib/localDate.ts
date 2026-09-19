/**
 * "오늘"을 로컬 타임존 기준 `YYYY-MM-DD` 문자열로 만든다.
 *
 * **UTC(`toISOString()`)를 쓰면 안 된다** — 한국 시간으로 오전 9시 이전은 어제 날짜가 되어,
 * 아침에 공부하면 스트릭이 안 오르거나 인사를 두 번 하게 된다.
 *
 * 스트릭(gamificationStore)과 선생님 인사(pageStateStore)가 같은 기준을 써야 하므로
 * 여기 한 곳에 둔다.
 */
export function localDateKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 선생님 대화 사이드바에 쓸 날짜 이름. `todayKey`를 받아서 **"오늘"의 기준을 호출하는 쪽이
 * 정하게** 한다 — 안에서 `new Date()`를 부르면 테스트할 수 없고, 자정을 넘긴 화면이 조용히
 * 어제를 "오늘"이라고 부르게 된다.
 */
export function formatDayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "오늘";

  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;

  const [ty, tm, td] = todayKey.split("-").map(Number);
  // 어제인지는 날짜끼리 하루를 빼서 본다 — 문자열로 비교하면 달·해가 바뀌는 날 틀린다.
  const yesterday = new Date(ty, tm - 1, td - 1);
  if (yesterday.getFullYear() === y && yesterday.getMonth() + 1 === m && yesterday.getDate() === d) {
    return "어제";
  }

  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  // 해가 다르면 연도까지 — 같은 9월 17일이 여러 개 보이면 어느 해인지 알 수 없다.
  if (y !== ty) return `${y}년 ${m}월 ${d}일`;
  return `${m}월 ${d}일 (${weekday})`;
}
