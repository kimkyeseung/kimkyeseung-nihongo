// 학습 데이터 백업 파일을 만들고 읽는다. **전부 순수 함수**다 — 저장소를 읽고 쓰는 건
// BackupCard가 하고, 여기서는 "무엇을 담고 무엇을 믿을지"만 정한다(backup.test.ts가 고정한다).
//
// 왜 필요한가: 서버가 없는 앱이라 단어장·스트릭(localStorage)과 기록·기억·선생님 대화
// (IndexedDB)가 **이 브라우저에만** 있다. 브라우저 데이터를 지우거나 기기를 바꾸면 끝이고,
// Safari는 한동안 안 들른 사이트의 저장소를 스스로 비운다(Gemma 노트의 OPFS 이야기와 같다).
//
// 백업 파일은 **사용자가 고른 아무 파일**이라 복원할 때 그대로 믿으면 안 된다:
//  - localStorage는 허용한 키만 쓴다. 모르는 키를 받아 쓰면 다른 기능의 설정을 덮을 수 있다.
//  - 기억(fact)은 선생님 시스템 프롬프트에 들어가는 자리라 sanitizeMemoryLine을 다시 통과시킨다
//    (프롬프트를 만들 때도 한 번 더 거르지만, 저장소에 들어가는 것부터 막는다).
//  - 모양이 틀린 레코드는 버린다. 틀린 걸 넣으면 화면이 조용히 이상해지거나 죽는다.

import type { MemoryDump, MemoryFact, StoredMessage, StudyEvent } from "./learnerMemoryDb";
import { sanitizeMemoryLine } from "./promptSafety";

export const BACKUP_FORMAT = "kimkyeseung-nihongo-backup";
/** 파일 모양이 바뀌면 올린다. 더 높은 버전의 파일은 읽지 않는다(모르는 모양을 추측하지 않는다). */
export const BACKUP_VERSION = 1;

/**
 * 백업에 담는 localStorage 키(Zustand `persist`의 `name`). **학습자의 것만** 담는다.
 *
 * 일부러 뺀 것:
 *  - `ai-engine` — 기기마다 다르다. Gemma를 받은 컴퓨터의 백업을 폰에 풀면, 모델이 없는 폰이
 *    Gemma로 설정되어 "모델을 받아주세요" 안내부터 본다.
 *  - `teacher-greeting` — "오늘 인사를 했나"라서 옮길 이유가 없다.
 *  - `promptApiNoticeDismissed` — 이 브라우저의 AI 지원 여부에 달린 안내라 기기마다 다르다.
 *  - `appearance` — 화면 모드. 폰은 어둡게, 컴퓨터는 밝게 쓰는 식으로 기기마다 다르다.
 *
 * **새 `persist` 스토어를 만들면 여기에 넣을지 정할 것** — 빠뜨려도 콘솔은 조용하고, 복원한
 * 사람만 그 설정이 사라진 걸 나중에 안다.
 */
export const BACKUP_LOCAL_KEYS = [
  "wordbook",
  "sentencebook",
  "kanji-progress",
  "gamification",
  "curriculum",
  "user-profile",
  "recent-searches",
  "gojuon-view",
  "kanji-view",
  "wordbook-view",
  "writing-options",
  "input-script",
  // 레벨 진단 결과(최근 3번). 학습 이력이다. 되돌릴 때 levelTestStore의 merge가 모양을 다시 검사한다.
  "level-test",
] as const;

export type BackupLocalKey = (typeof BACKUP_LOCAL_KEYS)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** ISO 시각. 화면에 "언제 백업한 것인지" 보여주는 용도. */
  exportedAt: string;
  /** localStorage 원문 그대로(zustand persist가 쓴 JSON 문자열). */
  local: Partial<Record<BackupLocalKey, string>>;
  /**
   * 기록·기억·대화. **`null`은 "백업할 때 읽지 못했다"는 뜻**이다(사생활 보호 모드 등).
   * 빈 배열(= 정말 아무것도 없었다)과 다르다 — `null`이면 복원할 때 지금 있는 걸 지우지 않는다.
   */
  memory: MemoryDump | null;
}

export interface BackupSummary {
  words: number;
  sentences: number;
  kanjiLearned: number;
  xp: number;
  streak: number;
  events: number;
  facts: number;
  chatDays: number;
  /** 모양이 틀려서 버린 레코드 수. 0이 아니면 화면에 알린다. */
  skipped: number;
}

export type ParseBackupResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

export function buildBackup(
  readLocal: (key: string) => string | null,
  memory: MemoryDump | null,
  now: Date
): BackupFile {
  const local: BackupFile["local"] = {};
  for (const key of BACKUP_LOCAL_KEYS) {
    const value = readLocal(key);
    if (value !== null) local[key] = value;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), local, memory };
}

/** `kimkyeseung-nihongo-backup-2026-09-27.json` — 로컬 날짜로(자정 넘어 UTC면 하루가 어긋난다). */
export function backupFileName(now: Date): string {
  return `${BACKUP_FORMAT}-${dateKeyOf(now)}.json`;
}

/** 로컬 타임존 `YYYY-MM-DD`. localDate.ts의 것은 "오늘 기준"만 받아서 따로 둔다. */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** zustand persist가 쓴 모양(`{"state": {...}, "version": n}`)인지. 아니면 그 키는 버린다. */
function isPersistedState(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && isRecord(parsed.state);
  } catch {
    return false;
  }
}

const EVENT_TYPES = new Set<string>([
  "kanji-quiz-correct",
  "kanji-quiz-wrong",
  "kanji-learned",
  "word-added",
  "word-review-known",
  "word-review-unknown",
  "word-looked-up",
  "writing-corrected",
  "writing-clean",
  "teacher-question",
  "conversation-practice",
  "kana-studied",
]);
const JLPT = new Set(["N5", "N4", "N3", "N2", "N1"]);
const FACT_KINDS = new Set(["goal", "schedule", "job", "interest"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function readEvent(value: unknown): StudyEvent | null {
  if (!isRecord(value)) return null;
  const { id, at, type, subject, detail, level } = value;
  if (typeof at !== "number" || typeof type !== "string" || !EVENT_TYPES.has(type)) return null;
  if (typeof subject !== "string") return null;
  if (detail !== undefined && typeof detail !== "string") return null;
  if (level !== undefined && !(typeof level === "string" && JLPT.has(level))) return null;
  if (id !== undefined && typeof id !== "number") return null;
  return { id, at, type, subject, detail, level } as StudyEvent;
}

function readFact(value: unknown): MemoryFact | null {
  if (!isRecord(value)) return null;
  const { id, kind, text, status, source, createdAt } = value;
  if (typeof id !== "string" || typeof kind !== "string" || !FACT_KINDS.has(kind)) return null;
  if (typeof text !== "string") return null;
  if (status !== "pending" && status !== "confirmed") return null;
  if (source !== "auto" && source !== "manual") return null;
  if (typeof createdAt !== "number") return null;
  // 선생님 시스템 프롬프트에 들어가는 자리라 파일에 적힌 그대로 믿지 않는다.
  const clean = sanitizeMemoryLine(text);
  if (!clean) return null;
  return { id, kind, text: clean, status, source, createdAt } as MemoryFact;
}

function readMessage(value: unknown): StoredMessage | null {
  if (!isRecord(value)) return null;
  const { id, date, role, text, at } = value;
  if (typeof id !== "string" || typeof date !== "string" || !DATE_KEY.test(date)) return null;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof text !== "string" || typeof at !== "number") return null;
  return { id, date, role, text, at };
}

function readList<T>(value: unknown, read: (v: unknown) => T | null): { items: T[]; skipped: number } | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  let skipped = 0;
  for (const v of value) {
    const item = read(v);
    if (item) items.push(item);
    else skipped++;
  }
  return { items, skipped };
}

/**
 * 파일 내용을 읽어 믿을 수 있는 것만 남긴다. 실패하면 **화면에 그대로 보여줄 한국어 문장**을
 * 돌려준다.
 */
export function parseBackup(text: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "백업 파일을 읽을 수 없어요. 이 앱에서 내보낸 .json 파일인지 확인해 주세요." };
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: "이 앱의 백업 파일이 아니에요." };
  }
  if (typeof parsed.version !== "number" || parsed.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: "더 새로운 버전의 앱에서 만든 백업이에요. 페이지를 새로고침해 앱을 최신으로 받은 뒤 다시 시도해 주세요.",
    };
  }

  let skipped = 0;
  const local: BackupFile["local"] = {};
  if (isRecord(parsed.local)) {
    for (const key of BACKUP_LOCAL_KEYS) {
      const value = parsed.local[key];
      if (value === undefined) continue;
      if (typeof value === "string" && isPersistedState(value)) local[key] = value;
      else skipped++;
    }
  }

  let memory: MemoryDump | null = null;
  if (isRecord(parsed.memory)) {
    const events = readList(parsed.memory.events, readEvent);
    const facts = readList(parsed.memory.facts, readFact);
    const messages = readList(parsed.memory.messages, readMessage);
    if (!events || !facts || !messages) {
      return { ok: false, error: "백업 파일의 학습 기록 부분이 망가져 있어요." };
    }
    memory = { events: events.items, facts: facts.items, messages: messages.items };
    skipped += events.skipped + facts.skipped + messages.skipped;
  }

  const hasLocal = Object.keys(local).length > 0;
  const hasMemory =
    memory !== null && memory.events.length + memory.facts.length + memory.messages.length > 0;
  if (!hasLocal && !hasMemory) {
    return { ok: false, error: "백업 파일에 복원할 내용이 없어요." };
  }

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    local,
    memory,
  };
  return { ok: true, backup, summary: summarizeBackup(backup, skipped) };
}

function persistedState(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && isRecord(parsed.state) ? parsed.state : {};
  } catch {
    return {};
  }
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

/** "무엇이 들어 있는 백업인지" — 복원하기 전에 확인시키는 숫자들. */
export function summarizeBackup(backup: BackupFile, skipped = 0): BackupSummary {
  const wordbook = persistedState(backup.local.wordbook);
  const sentencebook = persistedState(backup.local.sentencebook);
  const kanji = persistedState(backup.local["kanji-progress"]);
  const game = persistedState(backup.local.gamification);
  const memory = backup.memory;
  return {
    words: countOf(wordbook.entries),
    sentences: countOf(sentencebook.entries),
    kanjiLearned: countOf(kanji.learned),
    xp: typeof game.xp === "number" ? game.xp : 0,
    streak: typeof game.streak === "number" ? game.streak : 0,
    events: memory?.events.length ?? 0,
    facts: memory?.facts.length ?? 0,
    chatDays: memory ? new Set(memory.messages.map((m) => m.date)).size : 0,
    skipped,
  };
}
