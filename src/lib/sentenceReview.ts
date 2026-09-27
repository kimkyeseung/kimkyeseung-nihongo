// 단어장 **문장 칸 복습**의 순수 로직. 간격 계산 자체는 단어와 같은 srs.ts를 쓰고, 여기서는
// "문장에 딸린 번역을 어디서 가져오나"와 "SRS 필드가 없는 옛 문장을 어떻게 볼까"만 정한다
// (sentenceReview.test.ts가 고정한다).

import type { SrsState } from "./srs";

const HANGUL = /[\uac00-\ud7a3]/;
const KANA = /[\u3040-\u30ff]/;
/** 줄 전체가 이탤릭·굵게·괄호로 감싸져 있는가. */
const WRAPPED = /^(\*{1,2}|_{1,2}).+\1$|^[(（].+[)）]$/;

/**
 * 문장의 SRS 상태. 복습 기능이 생기기 전에 담은 문장에는 `srs`가 없다 — persist 마이그레이션을
 * 두는 대신 **담은 시각에 바로 복습할 때가 된 새 카드**로 본다(단어의 `createInitialSrs`와 같은
 * 값). 저장은 첫 복습 때 된다.
 */
export function sentenceSrs(entry: { srs?: SrsState; addedAt: number }): SrsState {
  return entry.srs ?? { interval: 0, easeFactor: 2.5, dueAt: entry.addedAt, reviewCount: 0 };
}

/**
 * 번역 한 줄을 정리한다. 괄호·이탤릭·따옴표·앞의 화살표 같은 꾸밈을 벗기고, **한글이 없거나
 * 일본어 가나가 섞여 있으면 번역이 아니라고 보고 null**이다(설명 문장이나 다른 예문을 번역으로
 * 착각해 저장하면 복습 카드 뒷면에 엉뚱한 뜻이 영원히 남는다).
 */
export function cleanTranslation(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let text = raw.trim();
  // 벗길 게 없을 때까지 반복한다 — `*(물을 마셨습니다.)*`는 이탤릭 안에 괄호가 있다.
  for (let i = 0; i < 4; i++) {
    const before = text;
    text = text
      .replace(/^[-–—:：→=>]+\s*/, "")
      .replace(/^(\*{1,2}|_{1,2})(.*)\1$/s, "$2")
      .replace(/^[(（](.*)[)）]$/s, "$1")
      .replace(/^["“'‘「『](.*)["”'’」』]$/s, "$1")
      .trim();
    if (text === before) break;
  }
  if (!text || !HANGUL.test(text) || KANA.test(text) || text.includes("`")) return null;
  return text.length > 200 ? null : text;
}

/**
 * 선생님 답변(마크다운)에서 예문 바로 뒤에 붙은 한국어 번역을 찾는다. 선생님 프롬프트가 예문 다음
 * 줄에 `*(번역)*`을 쓰게 하고 있고, 모델은 가끔 같은 줄 뒤에 `— 번역`·`(번역)`으로 붙인다.
 *
 * - 같은 줄: 닫는 백틱 뒤에 남은 글이 번역 모양이면 쓴다.
 * - 다음 줄: **괄호나 이탤릭으로 감싼 줄만** 번역으로 친다. 그냥 한국어 줄은 대개 설명이다
 *   (「여기서 は는 주제를 나타내요」를 번역으로 저장하면 안 된다).
 *
 * 못 찾으면 null — 번역 없이 담기는 것뿐이고, 복습 카드는 그때 선생님에게 묻기를 권한다.
 */
export function findExampleTranslation(markdown: string, sentence: string): string | null {
  const target = sentence.trim();
  if (!target) return null;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const marker = `\`${target}\``;
    const at = lines[i].indexOf(marker);
    if (at < 0) continue;

    const rest = lines[i].slice(at + marker.length).trim();
    // 같은 줄은 구분 기호(— · → · :)로 시작하거나 통째로 감싼 것만 — 「`A`는 과거형이에요」의
    // 「는 과거형이에요」는 번역이 아니다.
    if (/^[-–—:：→=]/.test(rest) || WRAPPED.test(rest)) {
      const sameLine = cleanTranslation(rest);
      if (sameLine) return sameLine;
    }
    // 같은 줄에 다른 글(설명 등)이 이어지면 다음 줄은 이 예문의 번역이 아닐 가능성이 크다.
    if (HANGUL.test(rest)) continue;

    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length) continue;
    const next = lines[j].trim().replace(/^(?:[-*+]|>|\d+\.)\s+/, "");
    // 줄 전체가 감싸져 있어야 한다 — `*여기서* 는…`처럼 일부만 기울인 설명을 집지 않게.
    if (WRAPPED.test(next)) {
      const found = cleanTranslation(next);
      if (found) return found;
    }
  }
  return null;
}
