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

/**
 * 탁점·반탁점만 다른 글자들(か→が, は→ば·ぱ, ぢ→ち). "거의 맞음"의 기준이고 `kanaPronunciation.ts`의
 * `skeleton`과 같은 규칙이다. 예전엔 자음 표(ch→t, j→s)로 묶었더니 ぢ(j i)를 `ch i`(=ち)로 말한 것이
 * ❌가 됐다 — 실제 녹음에서 걸렸다. 글자에서 바로 만들면 표가 어긋날 일이 없다.
 */
function voicingVariants(kana: string): string[] {
  const [head, ...rest] = [...kana];
  const base = head.normalize("NFD").replace(/[\u3099\u309a]/g, "");
  return [base, base + "\u3099", base + "\u309a"]
    .map((c) => c.normalize("NFC"))
    .filter((c) => c.length === 1 && c !== head)
    .map((c) => c + rest.join(""));
}

const TAIL = new Set(["a", "i", "u", "e", "o", "N"]);

/**
 * 들린 음소를 음절로 나눠 본다: 각 음절이 `goals` 중 하나와 같고, 그 사이·뒤에 길게 끈 꼬리(모음·ん)가
 * 음절당 두 개까지면 통과. 통과하면 쓰인 goal의 번호들을 돌려준다(0이 정답, 나머지는 탁점 변형).
 */
function matchSyllables(heard: readonly string[], goals: readonly (readonly string[])[]): number[] | null {
  if (heard.length === 0) return null;
  const used: number[] = [];
  let i = 0;
  let extra = 0;
  while (i < heard.length) {
    const g = goals.findIndex((goal) => goal.every((p, k) => heard[i + k] === p));
    if (g >= 0) {
      used.push(g);
      i += goals[g].length;
    } else if (used.length > 0 && TAIL.has(heard[i])) {
      extra += 1;
      i += 1;
    } else {
      return null;
    }
  }
  return used.length > 0 && extra <= 2 * used.length ? used : null;
}

export function judgePhonemes(heard: readonly string[], kana: string): PhonemeJudgement {
  const goal = kanaToPhonemes(kana);
  if (!goal) return "wrong";
  const h = normalize(heard);
  // 탁점 변형이 정답과 같은 음소면(ぢ와 じ는 둘 다 j i) 변형으로 치지 않는다.
  const variants = voicingVariants(kana)
    .map(kanaToPhonemes)
    .filter((ps): ps is string[] => ps !== null && ps.join(" ") !== goal.join(" "));
  const used = matchSyllables(h, [goal, ...variants]);
  if (!used) return "wrong";
  // 전부 정답이면 정확, 탁점 변형이 하나라도 섞였으면(か か が도) 거의 맞음.
  return used.every((g) => g === 0) ? "exact" : "near";
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
