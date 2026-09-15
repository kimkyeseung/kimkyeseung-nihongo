import type { WordEntry } from "../types/dictionary";

export type VerbGroup = "ichidan" | "godan" | "suru" | "kuru";
export type AdjectiveType = "i" | "na";

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

function godanTeForm(word: string, pos: string[]): string {
  const last = word.slice(-1);
  const stem = word.slice(0, -1);
  // 行く/逝く 등 "v5k-s"(Iku/Yuku 특수활용)는 く 어미라도 いて가 아니라 って가 된다.
  if (last === "く" && pos.includes("v5k-s")) return `${stem}って`;
  return stem + (GODAN_TE_SUFFIX[last] ?? "って");
}

function suruTeForm(word: string): string {
  // "察する"처럼 표제어 자체가 する로 끝나는 경우와, "勉強"처럼 する가 붙지 않은
  // 명사(vs 태그)인 경우 둘 다 있어서 먼저 확인한다.
  const stem = word.endsWith("する") ? word.slice(0, -2) : word;
  return `${stem}して`;
}

function kuruTeForm(word: string): string {
  if (word.endsWith("来る")) return `${word.slice(0, -2)}来て`;
  if (word.endsWith("くる")) return `${word.slice(0, -2)}きて`;
  return `${word.slice(0, -1)}て`;
}

/**
 * 동사 て형을 규칙 기반으로 계산한다(LLM 미사용, 프로젝트 규칙). 사전의 품사 코드로
 * 동사 그룹(1단/5단/する/来る)을 판별한 뒤 각 활용 규칙을 적용한다. 동사가 아니면 null.
 */
export function getVerbTeForm(entry: WordEntry): string | null {
  const group = detectVerbGroup(entry.pos);
  if (!group) return null;

  switch (group) {
    case "ichidan":
      return `${entry.word.slice(0, -1)}て`;
    case "godan":
      return godanTeForm(entry.word, entry.pos);
    case "suru":
      return suruTeForm(entry.word);
    case "kuru":
      return kuruTeForm(entry.word);
  }
}
