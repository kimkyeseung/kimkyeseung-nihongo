import { dictionary } from "./dictionary";
import { getKanjiEntry } from "./kanji";
import { segmentSentenceIntoWords, type SentenceSegment } from "./sentenceWords";

const HAS_KANJI = /[㐀-䶿一-鿿]/;
const LEADING_KANA = /^[ぁ-んァ-ヴーゝゞ]+/;
/** 되돌린 표기가 원문에 실제로 있는지 볼 때, 뒤따르는 가나를 몇 글자까지 같이 확인할지. */
const TAIL_CHECK_LENGTH = 3;

let readingsByWord: Map<string, string[]> | null = null;

function buildReadingIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of dictionary) {
    if (entry.reading === entry.word) continue;
    const list = index.get(entry.word);
    if (list) {
      if (!list.includes(entry.reading)) list.push(entry.reading);
    } else {
      index.set(entry.word, [entry.reading]);
    }
  }
  return index;
}

function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 이 구간을 가나로 쓴다면 어떤 모양일지 후보를 모은다. 사전 표제어의 읽기를 우선 쓰고,
 * 활용형이라 표제어로 안 잡히는 한 글자(飲み의 飲 등)는 KANJIDIC 훈독/음독에서 가져온다.
 */
function candidateReadings(seg: SentenceSegment): string[] {
  const candidates = new Set<string>();

  readingsByWord ??= buildReadingIndex();

  // 활용형(食べました)은 표제어와 형태가 달라 표제어 읽기를 그대로 쓰면 안 된다.
  if (seg.word && seg.text === seg.word.word) {
    for (const reading of readingsByWord.get(seg.text) ?? []) candidates.add(reading);
  }

  // 그리디 최장일치가 뒤 글자까지 먹은 경우("今日は"가 こんにちは로 잡힘)를 위해, 뒤쪽 가나를
  // 떼어낸 한자 부분("今日")의 읽기도 후보로 둔다 — 뗀 가나는 그대로 뒤에 붙인다.
  const stem = seg.text.replace(/[ぁ-んァ-ヴーゝゞ]+$/, "");
  if (stem && stem !== seg.text) {
    const suffix = seg.text.slice(stem.length);
    for (const reading of readingsByWord.get(stem) ?? []) candidates.add(reading + suffix);
  }

  if (seg.text.length === 1 && HAS_KANJI.test(seg.text)) {
    const kanji = getKanjiEntry(seg.text);
    if (kanji) {
      // "く.う"는 어간 く까지만, "-とり"처럼 접두 표시가 붙은 것은 기호만 떼어 쓴다.
      for (const kun of kanji.kunyomi) candidates.add(kun.split(".")[0].replace(/-/g, ""));
      for (const on of kanji.onyomi) candidates.add(katakanaToHiragana(on));
    }
  }

  return [...candidates].filter((c) => c.length > 0 && c !== seg.text);
}

/** 두 문자열의 편집 거리(레벤슈타인). 첨삭 문장은 짧아서 단순 DP로 충분하다. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * "한자 변환 제안"이 꺼져 있을 때, 모델이 학습자가 가나로 쓴 말을 한자로 바꿔놓은 부분만
 * 원문 표기로 되돌린다.
 *
 * 프롬프트로 "학습자 표기를 유지하라"고 시키는 것(부정형·긍정형·예시까지)은 전부 실패했다 —
 * 모델이 그냥 すき를 好き로 바꿔버린다. 표기 변환은 사전만 있으면 결정적으로 판단할 수
 * 있으니, 읽기·품사를 LLM에게 맡기지 않는 이 프로젝트의 규칙과 같은 이유로 여기서도 모델
 * 대신 코드가 판단한다.
 *
 * 방법: 수정문을 사전 단어 단위로 자른 뒤, 한자가 든 구간을 그 구간의 가나 읽기로 바꿔보고
 * **원문과의 편집 거리가 줄어들 때만** 채택한다. 읽기가 같은 표기끼리만 바꾸므로 발음과 뜻은
 * 그대로다. 학습자가 애초에 한자로 쓴 말이나 문법 교정으로 새로 들어온 단어는 가나로 바꾸면
 * 거리가 늘어나므로 건드리지 않는다.
 */
export function preserveLearnerScript(
  original: string,
  corrected: string
): { text: string; reverted: boolean } {
  if (!corrected || corrected === original) return { text: corrected, reverted: false };

  const segments = segmentSentenceIntoWords(corrected);
  const parts = segments.map((seg) => seg.text);
  let best = editDistance(corrected, original);
  let reverted = false;
  let offset = 0;

  segments.forEach((seg, i) => {
    const start = offset;
    offset += seg.text.length;
    if (!HAS_KANJI.test(seg.text)) return;

    // 뒤따르는 가나(활용 어미 등)까지 붙여서 원문에 있는지 본다 — 한 글자짜리 읽기("い")는
    // 아무 문장에나 들어있어서, 이 확인이 없으면 엉뚱한 읽기(行き를 ゆき로)를 집어넣게 된다.
    const tail = (LEADING_KANA.exec(corrected.slice(start + seg.text.length))?.[0] ?? "").slice(
      0,
      TAIL_CHECK_LENGTH
    );

    const before = parts[i];
    let bestCandidate: string | null = null;
    for (const candidate of candidateReadings(seg)) {
      if (!original.includes(candidate + tail)) continue;
      parts[i] = candidate;
      const distance = editDistance(parts.join(""), original);
      if (distance < best) {
        best = distance;
        bestCandidate = candidate;
      }
    }
    parts[i] = bestCandidate ?? before;
    if (bestCandidate) reverted = true;
  });

  return { text: parts.join(""), reverted };
}
