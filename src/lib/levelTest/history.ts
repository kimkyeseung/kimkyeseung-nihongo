import { CURRICULUM_LEVELS, type CurriculumLevelId } from "../../types/curriculum";
import type { JlptLevel } from "../../types/jlpt";
import type { EstimatedLevel, LevelTestSection } from "../../types/levelTest";
import { dateKeyOf } from "../backup";
import { sanitizeMemoryLine } from "../promptSafety";
import { SECTION_ORDER, overallLevel, type LevelTestSections } from "./result";
import { SECTION_LABEL } from "./labels";

// 진단 결과를 저장하고 앱의 다른 곳(선생님 프롬프트·오늘의 학습·/test)과 잇는 규칙. 저장값은
// 백업 파일에서도 돌아오므로 믿지 않고 검사한다. 판단이 어긋나도 화면은 그럴듯하다 — 30일 지난
// 진단이 계속 이기거나, 선생님이 엉뚱한 급수로 설명한다. `history.test.ts`가 고정한다.

/** 저장하는 진단 한 번의 요약. 문제별 결과는 남기지 않는다(학습 기록에도 안 넣는 것과 같은 이유). */
export type LevelTestRecord = {
  /** 끝난 시각(ms). 같은 진단을 두 번 저장하지 않는 열쇠이기도 하다. */
  takenAt: number;
  /** 영역별 추정 급수. null = 측정 안 함. 가나는 풀었을 때만 있다. */
  sections: Partial<Record<LevelTestSection, EstimatedLevel | null>>;
  overall: EstimatedLevel | null;
};

/** 최근 몇 번까지 남기나 */
export const MAX_RECORDS = 3;
/** 진단이 기록 추정(levelGuess)을 이기는 기간 */
export const DIAGNOSIS_FRESH_DAYS = 30;
/** 이만큼 지나면 대문에서 "다시 진단해볼까요?"를 한 줄 띄운다 */
export const RETEST_SUGGEST_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function recordFromSections(sections: LevelTestSections, takenAt: number): LevelTestRecord {
  const out: LevelTestRecord["sections"] = {};
  for (const s of SECTION_ORDER) {
    const r = sections[s];
    if (r) out[s] = r.estimate;
  }
  return { takenAt, sections: out, overall: overallLevel(sections) };
}

/** 새 기록을 앞에 넣고 최근 3개만. 같은 `takenAt`이면 다시 넣지 않는다(StrictMode로 effect가 두 번 돌아도). */
export function addRecord(records: readonly LevelTestRecord[], record: LevelTestRecord): LevelTestRecord[] {
  if (records.some((r) => r.takenAt === record.takenAt)) return [...records];
  return [record, ...records].sort((a, b) => b.takenAt - a.takenAt).slice(0, MAX_RECORDS);
}

const isLevel = (v: unknown): v is CurriculumLevelId =>
  typeof v === "string" && (CURRICULUM_LEVELS as string[]).includes(v);

/**
 * 저장값(localStorage·백업 파일)을 믿지 않고 모양을 검사한다. 틀린 기록은 버리고, 영역 값이 이상하면
 * 그 영역만 "측정 안 함"으로 둔다. 급수 문자열은 정해진 것만 — 여기서 나온 값이 선생님 프롬프트에 들어간다.
 */
export function parseRecords(value: unknown): LevelTestRecord[] {
  if (!Array.isArray(value)) return [];
  const out: LevelTestRecord[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { takenAt, sections, overall } = item as Record<string, unknown>;
    if (typeof takenAt !== "number" || !Number.isFinite(takenAt) || takenAt <= 0) continue;
    if (overall !== null && !isLevel(overall)) continue;
    const cleanSections: LevelTestRecord["sections"] = {};
    if (typeof sections === "object" && sections !== null) {
      for (const s of SECTION_ORDER) {
        const v = (sections as Record<string, unknown>)[s];
        if (v === undefined) continue;
        cleanSections[s] = isLevel(v) ? v : null;
      }
    }
    out.push({ takenAt, sections: cleanSections, overall });
  }
  return out.sort((a, b) => b.takenAt - a.takenAt).slice(0, MAX_RECORDS);
}

/** 가장 최근 진단 */
export function latestRecord(records: readonly LevelTestRecord[]): LevelTestRecord | null {
  return records.reduce<LevelTestRecord | null>((best, r) => (!best || r.takenAt > best.takenAt ? r : best), null);
}

function isFresh(record: LevelTestRecord, now: number): boolean {
  return now - record.takenAt <= DIAGNOSIS_FRESH_DAYS * DAY_MS;
}

/**
 * 지금 학습자 수준을 한 곳에서 고른다 — `/test`·선생님 난이도·진단 시작 급수가 같은 판단을 써야 한다.
 * **최근 30일 안의 진단이 기록 추정(levelGuess)을 이긴다.** 진단은 일부러 영역마다 경계를 찾은 결과고,
 * 기록 추정은 그동안 건드린 단어의 급수일 뿐이다. 30일이 지나면 그 사이 공부한 기록 쪽을 믿는다.
 */
export function effectiveLevel(
  latest: LevelTestRecord | null,
  levelGuess: JlptLevel | null,
  now: number,
): EstimatedLevel | null {
  if (latest?.overall && isFresh(latest, now)) return latest.overall;
  return levelGuess;
}

/** 기록 추정이 아니라 진단이 쓰이고 있는가(선생님 프롬프트가 두 줄을 겹쳐 쓰지 않으려고) */
export function diagnosisIsFresh(latest: LevelTestRecord | null, now: number): boolean {
  return !!latest?.overall && isFresh(latest, now);
}

function levelText(level: EstimatedLevel): string {
  return level === "Pre-N5" ? "입문(N5 전)" : level;
}

/**
 * 선생님 시스템 프롬프트에 넣는 한 줄:
 * `레벨 진단(2026-10-08): 종합 N4 · 어휘 N3, 한자 N4, 문법 N4, 독해 N4, 청해 N5`
 * 전부 코드가 만든 값이지만 기억 자리에 들어가므로 `sanitizeMemoryLine`을 통과시킨다.
 */
export function diagnosisPromptLine(record: LevelTestRecord): string {
  const parts: string[] = [];
  for (const s of SECTION_ORDER) {
    if (!(s in record.sections)) continue;
    const v = record.sections[s];
    if (s === "kana") parts.push(`문자 ${v === "Pre-N5" ? "연습 필요" : "통과"}`);
    else parts.push(`${SECTION_LABEL[s]} ${v ? levelText(v) : "측정 안 함"}`);
  }
  const overall = record.overall ? levelText(record.overall) : "판정 불가";
  return sanitizeMemoryLine(`레벨 진단(${dateKeyOf(new Date(record.takenAt))}): 종합 ${overall} · ${parts.join(", ")}`, 200);
}

/**
 * 선생님에게 대신 묻는 질문(결과 화면의 "선생님에게 결과 물어보기"). 문장은 코드가 만든다.
 * 종합 급수 바로 뒤에 영역 괄호를 붙이지 않는다 — 입문이 "입문(N5 전)"이라 「종합 입문(N5 전)(어휘 …」처럼
 * 괄호가 겹쳤다(실제로 그렇게 나갔다).
 */
export function teacherQuestionFor(record: LevelTestRecord): string {
  const parts = SECTION_ORDER.filter((s) => s !== "kana" && record.sections[s]).map(
    (s) => `${SECTION_LABEL[s]} ${levelText(record.sections[s]!)}`,
  );
  const overall = record.overall ? levelText(record.overall) : "판정 불가";
  // 급수 뒤에 조사를 붙이지 않는다 — "N4가/N1이"처럼 읽는 소리에 따라 갈려서 콜론으로 잇는다.
  const detail = parts.length > 0 ? ` (영역별: ${parts.join(", ")})` : "";
  return `레벨 진단 결과 — 종합: ${overall}${detail}. 이 결과를 보면 앞으로 무엇부터 공부하면 좋을까요?`;
}

/** 대문에서 "다시 진단해볼까요?"를 띄울지 — 90일이 지났을 때만. 진단한 적이 없으면 다른 자리가 권한다. */
export function shouldSuggestRetest(latest: LevelTestRecord | null, now: number): boolean {
  return !!latest && now - latest.takenAt > RETEST_SUGGEST_DAYS * DAY_MS;
}

/** XP는 진단 완주에 주되 **하루 한 번까지만** — 다시 진단하기를 반복해 긁어가지 못하게. */
export function canEarnDiagnosisXp(lastXpDay: string | null, todayKey: string): boolean {
  return lastXpDay !== todayKey;
}
