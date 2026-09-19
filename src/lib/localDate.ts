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
