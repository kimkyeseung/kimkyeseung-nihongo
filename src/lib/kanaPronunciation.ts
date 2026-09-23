import { toHiragana } from "wanakana";
import type { KanaCell } from "../data/gojuon";

/**
 * 오십음도 발음 게임의 채점과 출제. 전부 순수 함수다 — 채점이 틀려도 콘솔은 조용하고,
 * 제대로 읽은 사용자만 "왜 틀렸다고 하지?" 하고 만다.
 *
 * 채점이 까다로운 이유는 **음성 인식기가 가나 한 글자를 가나로 돌려주지 않기 때문**이다.
 * "か"라고 말하면 蚊·課가, "て"는 手가, "に"는 "2"가 오고, 가타카나("カ")나 로마자("ka")로
 * 오기도 한다. 그래서 인식 결과를 히라가나로 맞춰 비교하고, 한자는 사전에서 미리 뽑아둔
 * 동음어 표(kana-homophones.json)로 읽기를 찾는다 — 읽기를 모델에게 묻지 않는다.
 */

/** 한 판에 내는 문제 수. */
export const SPEAKING_ROUNDS = 10;

/**
 * 발음이 같아 인식기가 서로 바꿔 쓰는 글자. ぢ·づ는 じ·ず와, を는 お와 소리가 같다 —
 * 인식기가 ぢ를 돌려줄 일은 없으므로 이걸 맞추지 않으면 그 칸은 영원히 틀린다.
 */
const SAME_SOUND: Record<string, string> = { ぢ: "じ", づ: "ず", を: "お" };

/** 인식기가 숫자로 받아 적는 경우(に → "2"). 동음어 표에서 찾을 수 있게 한자 숫자로 바꾼다. */
const DIGIT_TO_KANJI = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 소리와 상관없는 문자: 구두점·공백·장음·물결. 끝에 붙는 "。"나 "かー"의 ー를 떼려는 것. */
const NOISE = /[\s\p{P}\p{S}ー〜～]/gu;

/** 말끝에 딸려 오는 촉음·작은 모음(「あっ」「かぁ」). 떼어낸 형태도 후보로 본다. */
const TRAILING_TAIL = /[っぁぃぅぇぉ]+$/;

function sameSound(text: string): string {
  return text.replace(/[ぢづを]/g, (ch) => SAME_SOUND[ch]);
}

/**
 * 인식 결과 하나를 비교할 수 있는 형태로. 전각→반각(NFKC), 잡음 제거, 가타카나·로마자 →
 * 히라가나. 한자는 그대로 남는다(동음어 표로 따로 찾는다).
 */
export function normalizeHeard(text: string): string {
  const cleaned = text.normalize("NFKC").replace(NOISE, "");
  // toHiragana는 로마자도 바꾼다("ka" → "か"). 인식기가 로마자로 받아 적는 경우를 그대로 잡는다.
  return toHiragana(cleaned.toLowerCase()).replace(/[0-9]/g, (d) => DIGIT_TO_KANJI[Number(d)]);
}

/** 채점에 필요한 것만. 표에 보이는 가나와 무관하게 히라가나 키로 비교한다. */
export type SpeakingTarget = Pick<KanaCell, "hiragana" | "romaji">;

/**
 * 인식 결과(대안 여러 개) 중 하나라도 목표 글자로 읽히면 맞다.
 * @param heard 인식기가 준 후보들(interim 포함). 순서는 상관없다.
 * @param homophones 목표 글자와 읽기가 같은 표기(kana-homophones.json의 그 글자 항목).
 */
export function matchesKana(
  heard: readonly string[],
  target: SpeakingTarget,
  homophones: readonly string[] = []
): boolean {
  const goal = sameSound(target.hiragana);
  const homophoneSet = new Set(homophones);

  return heard.some((raw) => {
    const text = normalizeHeard(raw);
    if (!text) return false;
    if (homophoneSet.has(text)) return true;

    const kana = sameSound(text);
    const candidates = [kana, kana.replace(TRAILING_TAIL, "")];
    return candidates.some(
      (c) =>
        c === goal ||
        // 「か、か」처럼 같은 글자를 되풀이한 경우(급하게 두 번 말하면 이렇게 온다).
        (c.length > goal.length && c.length % goal.length === 0 && c === goal.repeat(c.length / goal.length))
    );
  });
}

/**
 * 출제할 칸 목록. 소리를 따로 정해둔 칸(`speech` — 작은 ヵ・ヶ)은 뺀다: 글자 모양과 읽는
 * 소리가 달라서 "이 글자를 읽어보세요"로 낼 수 없다.
 */
export function speakableCells(cells: readonly (KanaCell | null)[]): KanaCell[] {
  return cells.filter((c): c is KanaCell => c !== null && !c.speech);
}

/** 겹치지 않게 섞어 최대 `count`개. `random`은 테스트에서 고정하려고 받는다. */
export function pickRounds(
  cells: readonly KanaCell[],
  count = SPEAKING_ROUNDS,
  random: () => number = Math.random
): KanaCell[] {
  const pool = [...cells];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
