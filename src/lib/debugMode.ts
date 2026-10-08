import type { StoredMessage } from "./learnerMemoryDb";

/** localStorage 키. 기기마다 다르므로 백업(`BACKUP_LOCAL_KEYS`)에는 담지 않는다. */
export const DEBUG_STORAGE_KEY = "debug-mode";

/** 주소창 파라미터 이름 (`?debug=1` 켜기 / `?debug=0` 끄기). */
export const DEBUG_QUERY_PARAM = "debug";

const ON_VALUES = new Set(["1", "true", "on"]);
const OFF_VALUES = new Set(["0", "false", "off"]);

/**
 * 주소의 검색 문자열(`location.search`)에서 디버그 모드 지시를 읽는다.
 * 켜라면 true, 끄라면 false, **지시가 없거나 알 수 없는 값이면 null**(= 지금 상태를 건드리지
 * 않는다). `?debug=`처럼 비었거나 `?debug=maybe`가 모드를 끄면 안 된다.
 */
export function parseDebugQuery(search: string): boolean | null {
  const value = new URLSearchParams(search).get(DEBUG_QUERY_PARAM)?.trim().toLowerCase();
  if (value === undefined) return null;
  if (ON_VALUES.has(value)) return true;
  if (OFF_VALUES.has(value)) return false;
  return null;
}

/** 검색 문자열에서 디버그 파라미터만 뗀다. 다른 파라미터(`?review=weak` 등)는 그대로 둔다. */
export function stripDebugQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(DEBUG_QUERY_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export const TEACHER_CHAT_EXPORT_FORMAT = "kimkyeseung-nihongo-teacher-chat";
export const TEACHER_CHAT_EXPORT_VERSION = 1;

export type TeacherChatExport = {
  format: typeof TEACHER_CHAT_EXPORT_FORMAT;
  version: typeof TEACHER_CHAT_EXPORT_VERSION;
  exportedAt: string;
  /** 로컬 타임존 `YYYY-MM-DD`. 하루가 대화 한 묶음이다. */
  date: string;
  /**
   * **IndexedDB의 `messages` 스토어 행(`StoredMessage`) 그대로다.** 필드를 고르거나 이름을
   * 바꾸지 않는다 — 백업 파일의 `memory.messages`와 같은 모양이라 그대로 되돌려 넣을 수 있다.
   */
  messages: StoredMessage[];
};

/**
 * 하루치 대화를 내려받을 JSON으로 만든다. 행은 시간순으로만 정렬하고 **한 글자도 손대지
 * 않는다**(`date`가 다른 행은 이 날짜의 대화가 아니므로 뺀다).
 */
export function buildTeacherChatExport(
  date: string,
  messages: StoredMessage[],
  now: Date
): TeacherChatExport {
  return {
    format: TEACHER_CHAT_EXPORT_FORMAT,
    version: TEACHER_CHAT_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    date,
    messages: messages.filter((m) => m.date === date).sort((a, b) => a.at - b.at),
  };
}

export function teacherChatExportFileName(date: string): string {
  return `teacher-chat-${date}.json`;
}

/** JSON을 파일로 내려받는다. 서버가 없으니 Blob 링크를 눌러 주는 수밖에 없다. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 revoke하면 일부 브라우저(Safari)가 다운로드를 시작하기 전에 URL이 사라진다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
