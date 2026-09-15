import type { WordEntry } from "../types/dictionary";

export type VerbGroup = "ichidan" | "godan" | "suru" | "kuru";
export type AdjectiveType = "i" | "na";
export type VerbTeForm = { kanji: string; reading: string | null };

const ICHIDAN_POS = new Set(["v1", "v1-s", "vz"]);
const SURU_POS = new Set(["vs", "vs-i", "vs-s", "vs-c"]);
const I_ADJ_POS = new Set(["adj-i", "adj-ix", "adj-ku", "adj-shiku"]);
const NA_ADJ_POS = new Set(["adj-na", "adj-nari"]);

function detectVerbGroup(pos: string[]): VerbGroup | null {
  if (pos.includes("vk")) return "kuru";
  if (pos.some((p) => SURU_POS.has(p))) return "suru";
  if (pos.some((p) => ICHIDAN_POS.has(p))) return "ichidan";
  if (pos.some((p) => p.startsWith("v5"))) return "godan";
  return null;
}

/** 사전의 품사 코드로 い형용사/な형용사 여부를 판별한다 (LLM이 아니라 정적 데이터 기반). */
export function detectAdjectiveType(entry: WordEntry): AdjectiveType | null {
  if (entry.pos.some((p) => I_ADJ_POS.has(p))) return "i";
  if (entry.pos.some((p) => NA_ADJ_POS.has(p))) return "na";
  return null;
}

// 五段(godan) 동사의 어미별 て형 접미사. る 어미는 "行く"류(v5k-s) 예외를 아래서 따로 처리한다.
const GODAN_TE_SUFFIX: Record<string, string> = {
  う: "って",
  つ: "って",
  る: "って",
  く: "いて",
  ぐ: "いで",
  す: "して",
  ぬ: "んで",
  ぶ: "んで",
  む: "んで",
};

function godanTeForm(base: string, pos: string[]): string {
  const last = base.slice(-1);
  const stem = base.slice(0, -1);
  // 行く/逝く 등 "v5k-s"(Iku/Yuku 특수활용)는 く 어미라도 いて가 아니라 って가 된다.
  if (last === "く" && pos.includes("v5k-s")) return `${stem}って`;
  return stem + (GODAN_TE_SUFFIX[last] ?? "って");
}

function suruTeForm(base: string): string {
  // "察する"처럼 표제어 자체가 する로 끝나는 경우와, "勉強"처럼 する가 붙지 않은
  // 명사(vs 태그)인 경우 둘 다 있어서 먼저 확인한다.
  const stem = base.endsWith("する") ? base.slice(0, -2) : base;
  return `${stem}して`;
}

function kuruTeForm(base: string): string {
  if (base.endsWith("来る")) return `${base.slice(0, -2)}来て`;
  if (base.endsWith("くる")) return `${base.slice(0, -2)}きて`;
  return `${base.slice(0, -1)}て`;
}

// word(한자 표기)와 reading(히라가나)에 똑같이 적용한다 — 동사는 항상 마지막 글자가
// 두 표기 모두에서 같은 가나이므로(오쿠리가나 규칙), 어미 기반 규칙이 그대로 통한다.
function conjugateTeForm(base: string, group: VerbGroup, pos: string[]): string {
  switch (group) {
    case "ichidan":
      return `${base.slice(0, -1)}て`;
    case "godan":
      return godanTeForm(base, pos);
    case "suru":
      return suruTeForm(base);
    case "kuru":
      return kuruTeForm(base);
  }
}

/**
 * 동사 て형을 규칙 기반으로 계산한다(LLM 미사용, 프로젝트 규칙). 사전의 품사 코드로
 * 동사 그룹(1단/5단/する/来る)을 판별한 뒤 각 활용 규칙을 적용한다. 동사가 아니면 null.
 * word(한자 표기)뿐 아니라 reading(히라가나)도 함께 계산한다 — 단, 표제어 자체가 이미
 * 가나뿐이라 둘이 같으면(예: 외래어 する동사) reading은 null로 둬서 중복 표시를 피한다.
 */
export function getVerbTeForm(entry: WordEntry): VerbTeForm | null {
  const group = detectVerbGroup(entry.pos);
  if (!group) return null;

  const kanji = conjugateTeForm(entry.word, group, entry.pos);
  const readingForm = conjugateTeForm(entry.reading, group, entry.pos);
  return { kanji, reading: readingForm === kanji ? null : readingForm };
}
