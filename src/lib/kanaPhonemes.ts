import { toRomaji } from "wanakana";

/**
 * 음소 인식 모델(HuBERT 음소 CTC, pyopenjtalk 표기)의 출력으로 가나 발음을 채점한다(시험 중, `/lab/asr`).
 * 모델은 「か」를 `k a`, 「し」를 `sh i`, 「ん」을 `N`으로 낸다. 받아 적은 글자가 아니라 **소리**라서
 * 동음어 한자(蚊)나 숫자(2) 같은 우회가 필요 없고, 무엇을 잘못 말했는지(k ↔ g)를 바로 안다.
 *
 * 판정 기준은 `kanaPronunciation.ts`와 맞춘다: 정확 / 거의 맞음(탁점·반탁점만 다름) / 틀림,
 * 길게 끈 꼬리(모음·ん 두 개까지)와 같은 음절의 되풀이는 봐준다.
 */

export type PhonemeJudgement = "exact" | "near" | "wrong";

const SYLLABLE = /^(ch|sh|ts|ky|gy|ny|hy|by|py|my|ry|dy|ty|fy|j|f|v|[kgsztdnhbpmyrw])?([aiueo])$/;

const SMALL_VOWEL: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };
/** 외래어 표기에서 앞 글자가 주는 자음. くぁ·ぐぁ는 모델 어휘에 kw·gw가 따로 있다. */
const GAIRAIGO_CONSONANT: Record<string, string> = { う: "w", い: "y", く: "kw", ぐ: "gw" };

/** 가나(한 음절, 요음·외래어 표기 포함) → 음소. 모르는 모양이면 null. */
export function kanaToPhonemes(kana: string): string[] | null {
  if (kana === "ん") return ["N"];
  if (kana === "を") return ["o"];
  // 외래어 표기(ふぁ·てぃ·つぁ·うぃ…): 앞 글자의 자음 + 작은 모음. wanakana는 ふぁ를 "fua"로 낸다.
  if (kana.length === 2 && SMALL_VOWEL[kana[1]]) {
    const head = GAIRAIGO_CONSONANT[kana[0]] ?? kanaToPhonemes(kana[0])?.[0];
    return head && head.length <= 2 && !"aiueo".includes(head) ? [head, SMALL_VOWEL[kana[1]]] : null;
  }
  // ふゅ·ゔゅ·てゅ·でゅ: wanakana가 못 읽는다. 모델 어휘에 vy가 없어 ゔゅ는 by(pyopenjtalk도 ヴュ를 by u로 낸다).
  if (kana === "ふゅ") return ["fy", "u"];
  if (kana === "ゔゅ") return ["by", "u"];
  // てゅ·でゅ(テュ·デュ): wanakana가 teyu로 낸다. 모델 어휘의 ty·dy.
  if (kana === "てゅ") return ["ty", "u"];
  if (kana === "でゅ") return ["dy", "u"];
  // wanakana: ぢ→ji, づ→zu, てぃ→ti, ゔ→vu
  const romaji = toRomaji(kana);
  const m = SYLLABLE.exec(romaji);
  if (!m) return null;
  return m[1] ? [m[1], m[2]] : [m[2]];
}

/** 모델의 무성화 모음(I·U)을 보통 모음으로, 촉음(cl)은 뺀다 — 한 글자 판정에서는 소리 차이가 아니다. */
function normalize(heard: readonly string[]): string[] {
  return heard.map((p) => (p === "I" ? "i" : p === "U" ? "u" : p)).filter((p) => p !== "cl");
}

/** 탁점·반탁점을 무시한 자음(か·が, は·ば·ぱ·ふ, さ·ざ, し·じ, た·だ, ち·ぢ). "거의 맞음"의 기준. */
const SKELETON: Record<string, string> = {
  g: "k", gy: "ky", z: "s", j: "s", sh: "s", d: "t", dy: "ty", ch: "t", ts: "t",
  b: "h", p: "h", f: "h", by: "hy", py: "hy", fy: "hy", v: "h",
};
const skeleton = (ps: readonly string[]) => ps.map((p) => SKELETON[p] ?? p);

const TAIL = new Set(["a", "i", "u", "e", "o", "N"]);

/** 목표 음절이 1번 이상(되풀이 포함) 나오고, 나머지가 길게 끈 꼬리 두 개 이하면 맞다. */
function matches(heard: readonly string[], goal: readonly string[]): boolean {
  if (heard.length === 0) return false;
  let i = 0;
  let hits = 0;
  let extra = 0;
  while (i < heard.length) {
    if (goal.every((g, k) => heard[i + k] === g)) {
      hits += 1;
      i += goal.length;
    } else if (hits > 0 && TAIL.has(heard[i])) {
      extra += 1;
      i += 1;
    } else {
      return false;
    }
  }
  return hits > 0 && extra <= 2 * hits;
}

export function judgePhonemes(heard: readonly string[], kana: string): PhonemeJudgement {
  const goal = kanaToPhonemes(kana);
  if (!goal) return "wrong";
  const h = normalize(heard);
  if (matches(h, goal)) return "exact";
  if (matches(skeleton(h), skeleton(goal))) return "near";
  return "wrong";
}

/** CTC 출력(프레임별 최댓값 id)을 음소 목록으로 — 연속된 같은 id를 합치고 공백·쉼 토큰을 뺀다. */
export function decodeCtc(ids: ArrayLike<number>, vocab: readonly string[]): string[] {
  const out: string[] = [];
  let prev = -1;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id !== prev) {
      const tok = vocab[id];
      if (tok && !SILENT.has(tok)) out.push(tok);
    }
    prev = id;
  }
  return out;
}
const SILENT = new Set(["PAD", "pau", "sil", "SOS", "EOS", "UNK"]);
