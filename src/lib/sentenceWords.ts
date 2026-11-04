import { dictionary } from "./dictionary";
import { getKanjiEntry } from "./kanji";
import { readNumberPrefix } from "./numberReading";
import type { Furigana, WordEntry } from "../types/dictionary";
import type { KanjiEntry } from "../types/kanji";

export interface SentenceSegment {
  text: string;
  word: WordEntry | null;
  /** word가 없을 때만: 활용형이라 사전 단어로는 안 잡히지만 그 글자 자체는 한자.json에 있는 경우. */
  kanji: KanjiEntry | null;
  /** 표제어 표기와 달라 따로 계산한 읽기(활용형의 어간·숫자+단위·성씨). 있으면 `rubyFor`가 이걸 쓴다. */
  ruby?: Furigana[];
  /** 읽기를 믿을 수 없는 자리 — 틀린 읽기를 다느니 달지 않는다(`rubyFor`). */
  noRuby?: boolean;
}

const KANJI_CHAR = /[㐀-鿿々]/;

/**
 * 사전에 없거나 사전 읽기가 문맥과 다른 복합어. 글자별로 쪼개면 田中가 田(た)+中(ちゅう)가 된다(실제로 보고받았다).
 * 문제 은행·커리큘럼에 나오는 성씨와, 사전의 何時가 いつ뿐이라 「今何時」가 いま·いつ로 읽히던 것을 담았다.
 * 새 이름이 나오면 여기에 더할 것(없으면 읽기가 안 달릴 뿐 틀리지는 않는다).
 */
const FIXED_READINGS: Record<string, string> = {
  田中: "たなか",
  山田: "やまだ",
  山本: "やまもと",
  鈴木: "すずき",
  中村: "なかむら",
  何時: "なんじ",
  入り口: "いりぐち",
  夜ふかし: "よふかし",
  手放: "てばな",
};

/** 옆에 다른 한자가 붙어도 혼자 읽히는 글자(今何時 → いま·なんじ). */
const READS_ALONE = new Set(["今", "何"]);

/** 앞말에 붙어 읽기가 바뀌는 품사(人 → じん, 店 → てん). */
const AFFIX_POS = new Set(["suf", "n-suf", "ctr", "pref"]);
const LEVEL_RANK: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/** 활용형의 어간 → 그 동사·형용사. 「食べ」→ 食べる, 「行」→ 行く·行う. */
type StemCandidate = { entry: WordEntry; next: ReadonlySet<string> | null; priority: number };
let stemIndex: Map<string, StemCandidate[]> | null = null;
let maxStemLength = 1;

const chars = (s: string) => new Set(s);
/** 5단 동사 끝 글자별로 어간 뒤에 올 수 있는 글자(음편 포함). */
const GODAN_NEXT: Record<string, ReadonlySet<string>> = {
  う: chars("わいうえおっ"),
  く: chars("かきくけこい"),
  ぐ: chars("がぎぐげごい"),
  す: chars("さしすせそ"),
  つ: chars("たちつてとっ"),
  ぬ: chars("なにぬねのん"),
  ぶ: chars("ばびぶべぼん"),
  む: chars("まみむめもん"),
  る: chars("らりるれろっ"),
};
/** 한자로 끝나는 1단 어간(見·出·着) 뒤. 이것 없이 아무 글자나 받으면 「出が」의 出가 동사가 된다. */
const ICHIDAN_NEXT = chars("またてならよろれさず");
const ADJECTIVE_NEXT = chars("かくけさそいすめ");
const IKU_NEXT = chars("かきくけこっ");

function addStemCandidates(index: Map<string, StemCandidate[]>, entry: WordEntry) {
  const { word, pos } = entry;
  // 읽기를 어간에 맞춰 잘라야 해서 furigana가 있어야 하고, 드문 동사가 낱말을 가로채지 못하게 흔한 것만 넣는다.
  // 가나로 쓰는 동사(有る·為る)는 한자로 나올 일이 거의 없다.
  if (!entry.furigana || entry.usuallyKana || !KANJI_CHAR.test(word[0])) return;
  if (!entry.common && !entry.jlptLevel) return;

  const last = word[word.length - 1];
  const stem = word.slice(0, -1);
  if (!stem) return;
  const add = (next: ReadonlySet<string> | null, priority = 0) => {
    const list = index.get(stem);
    const candidate = { entry, next, priority };
    if (list) list.push(candidate);
    else index.set(stem, [candidate]);
    maxStemLength = Math.max(maxStemLength, stem.length);
  };

  if (pos.includes("v5k-s")) add(IKU_NEXT, 1);
  else if (pos.some((p) => p.startsWith("v5")) && GODAN_NEXT[last]) add(GODAN_NEXT[last]);
  else if (last === "る" && pos.some((p) => p === "v1" || p === "v1-s")) {
    // 어간이 가나로 끝나면(食べ) 활용이 확실하니 뒤 글자를 따지지 않는다.
    add(KANJI_CHAR.test(stem[stem.length - 1]) ? ICHIDAN_NEXT : null);
  } else if (last === "い" && pos.some((p) => p === "adj-i" || p === "adj-ix")) add(ADJECTIVE_NEXT);
}

function stemRank(c: StemCandidate): number {
  return -c.priority * 100 + (c.entry.common ? 0 : 10) + (c.entry.jlptLevel ? LEVEL_RANK[c.entry.jlptLevel] : 5);
}

/** 어간의 후리가나 — 표제어의 것을 어간 길이에 맞춰 자른다(食べる → 食(た)·べ). */
function clipFurigana(furigana: readonly Furigana[], length: number): Furigana[] {
  const out: Furigana[] = [];
  let left = length;
  for (const piece of furigana) {
    if (left <= 0) break;
    if (piece.ruby.length <= left) out.push(piece);
    else out.push({ ...piece, ruby: piece.ruby.slice(0, left) });
    left -= piece.ruby.length;
  }
  return out;
}

/** 来る는 어간 표기가 来 하나인데 읽기가 뒤 글자에 따라 갈린다(来ない こ / 来た き). */
function kuruReading(next: string): string | null {
  if ("ないよらさず".includes(next)) return "こ";
  if ("たてま".includes(next)) return "き";
  return null;
}

const rubyReading = (ruby: readonly Furigana[]) => ruby.map((f) => f.rt ?? "").join("");

function findInflected(
  text: string,
  at: number
): { length: number; entry: WordEntry; ruby: Furigana[]; ambiguous: boolean } | null {
  if (!KANJI_CHAR.test(text[at])) return null;
  const upper = Math.min(maxStemLength, text.length - at - 1);
  for (let len = upper; len >= 1; len--) {
    const stem = text.slice(at, at + len);
    const next = text[at + len];
    const fits = stemIndex!.get(stem)?.filter((c) => (c.next ? c.next.has(next) : !KANJI_CHAR.test(next)));
    if (fits?.length) {
      const [best, ...others] = [...fits].sort((a, b) => stemRank(a) - stemRank(b));
      const ruby = clipFurigana(best.entry.furigana!, len);
      // 開か는 あく(N5)일 수도 ひらく(N4)일 수도 있다(「開かれる」는 ひら다). 표기가 같은 동사의 급수가 붙어 있거나
      // 한쪽 급수를 모르면(抱く だく/いだく) 고를 근거가 없다. 入る(はいる N5 / いる N1)처럼 멀면 낮은 급수가 맞다.
      const ambiguous = others.some((o) => {
        if (o.entry.word !== best.entry.word) return false;
        if (rubyReading(clipFurigana(o.entry.furigana!, len)) === rubyReading(ruby)) return false;
        const [a, b] = [o.entry.jlptLevel, best.entry.jlptLevel];
        return !a || !b || Math.abs(LEVEL_RANK[a] - LEVEL_RANK[b]) <= 1;
      });
      return { length: len, entry: best.entry, ruby, ambiguous };
    }
  }
  return null;
}

/** 표기(`word`)로 찾는 색인. 한자로 쓰인 자리는 여기서 잡힌다. */
let wordIndex: Map<string, WordEntry[]> | null = null;
/**
 * 읽기(`reading`)로 찾는 색인. **`usuallyKana`인 항목만 넣는다.**
 *
 * 없으면 가나로 쓰인 단어를 놓친다 (실제로 겪은 버그): `ため`는 사전에 `word: "為"` /
 * `reading: "ため"`로 들어 있어서 표기 색인만으로는 매치되지 않는다. 그러면 그리디가 길이
 * 1까지 내려가 **조동사 `た`를 집어서**, 「〜のため」의 ため를 눌렀는데 "과거를 나타냄"이 뜬다.
 *
 * 그렇다고 **모든 읽기를 넣으면 더 나빠진다 (실제로 해봤다).** 일본어의 활용 어미는 전부
 * 가나라서 온갖 명사의 읽기와 부딪힌다 — `します`가 `しま(縞)`+`す(酢)`로, `寝たほう`가
 * `たほう(他方)`로, `ました`가 `ます(増す)`+`した(舌)`로 잡혔다. `common`으로도 걸러지지
 * 않는다(전부 common이다).
 *
 * 그래서 JMDict의 `uk`(usually written using kana alone) 태그를 데이터로 가져와
 * (`build-dictionary.mjs`) **가나로 쓰는 단어만** 읽기로 찾게 했다. 為는 `uk`가 붙어 있고
 * 増す·舌·縞·栓·街·他方는 하나도 없다.
 */
let readingIndex: Map<string, WordEntry[]> | null = null;
let maxWordLength = 1;

/**
 * 읽기로는 찾지 않을 가나.
 *
 * `uk` 항목이라도 **활용 어미의 조각과 겹치는** 것들이 있다. 커리큘럼 예문 123개를 전수로
 * 훑어 실제로 잘못 잡힌 것만 담았다:
 * - `まし` → 増し : 「行きましょう」「見ました」의 ます 활용
 * - `まれ` → 稀 : 「踏まれました」의 수동형
 *
 * 나머지 매치(この·よう·ここ·ため·ください·せい·おかげ·たくさん…)는 전부 올바른 단어였다.
 *
 * **일반 규칙으로 풀려면 형태소 분석기가 필요하다** — 브라우저 안에서만 도는 이 앱에는
 * 과한 무게라, 실제로 부딪힌 것만 막는다. 새 오탐을 발견하면 여기에 한 줄 더할 것.
 */
const NOT_A_STANDALONE_READING = new Set(["まし", "まれ"]);

/**
 * **표기로는 찾지 않을 표제어** (읽기로는 그대로 찾는다).
 *
 * 그리디 최장일치는 낱말 경계를 모르기 때문에, 「今日は天気が良いです」의 앞 세 글자가
 * 사전의 `今日は`(こんにちは, "안녕하세요")에 걸린다. 그러면 **今日에 こんにち라는 후리가나가
 * 붙고**(실제로 보고받았다) 눌러보면 "hello"가 뜬다 — 여기의 は는 조사이고 今日는 きょう다.
 *
 * **"짧은 쪽을 고른다"는 일반 규칙으로 가면 안 된다 (데이터로 확인했다).** 표기가
 * `앞 단어 + 조사`인데 그 앞 단어도 사전에 있는 표제어가 52개인데, 非常に·急に·別に·実は·
 * 何か·誰か·更に·直ぐに처럼 **긴 쪽이 맞는 진짜 복합어가 대부분**이다. 짧은 쪽을 택하면
 * 그것들이 전부 깨진다.
 *
 * 실제로 깨지는 건 **한자로는 거의 안 쓰는 인사말** 둘뿐이라 그것만 막는다. 둘 다 `uk`라
 * 읽기 색인에는 그대로 들어가므로, **こんにちは라고 가나로 쓰면 여전히 인사말로 잡힌다**
 * (실제로 그렇게 쓰는 말이다). 새 오탐을 발견하면 여기에 한 줄 더할 것.
 *
 * `ねた`(이야깃거리)는 사전을 흔한 단어까지 넓히며 들어왔는데, 가나로만 쓴 「ねたほうがいい」의
 * 寝た(잤다)를 가로챘다(커리큘럼 예문 전수 비교에서 나온 유일한 새 오탐).
 */
// `彼の`은 あの(uk)로만 실려 있어서 「彼の話」의 彼가 あ로 읽혔다 — 한자로 쓴 彼の는 거의 언제나 かれの다.
const NOT_A_STANDALONE_SPELLING = new Set(["今日は", "今晩は", "ねた", "彼の"]);

function addTo(index: Map<string, WordEntry[]>, key: string, entry: WordEntry) {
  const list = index.get(key);
  if (list) list.push(entry);
  else index.set(key, [entry]);
}

function buildIndexes() {
  const words = new Map<string, WordEntry[]>();
  const readings = new Map<string, WordEntry[]>();
  const stems = new Map<string, StemCandidate[]>();
  for (const entry of dictionary) {
    addStemCandidates(stems, entry);
    if (!NOT_A_STANDALONE_SPELLING.has(entry.word)) {
      addTo(words, entry.word, entry);
      maxWordLength = Math.max(maxWordLength, entry.word.length);
    }
    // 한 글자짜리 읽기는 넣지 않는다 — 활용 어미와 부딪히기만 한다. 為(す) 하나 때문에
    // 「です」·「ます」의 끝 글자가 전부 단어로 잡혔다.
    // 급수 없는 단어(사전을 흔한 단어까지 넓히며 들어온 것)는 읽기로 찾지 않는다 — 넣었더니
    // 「あります」의 あり가 蟻(개미, uk·common)로 잡혔다. 읽기 색인은 급수 단어로 맞춰 둔 것이다.
    if (
      entry.usuallyKana &&
      entry.jlptLevel &&
      entry.reading.length >= 2 &&
      entry.reading !== entry.word &&
      !NOT_A_STANDALONE_READING.has(entry.reading)
    ) {
      addTo(readings, entry.reading, entry);
      maxWordLength = Math.max(maxWordLength, entry.reading.length);
    }
  }
  wordIndex = words;
  readingIndex = readings;
  stemIndex = stems;
}

/**
 * 이 글자와 표기(또는 가나로 쓰는 단어의 읽기)가 같은 사전 항목. 분절과 **같은 색인·같은 예외 목록**을
 * 쓴다 — 선생님 질문의 사전 참고(teacherGrounding.ts)가 활용형을 사전형으로 되돌려 찾을 때 쓴다.
 */
export function lookupWord(text: string): readonly WordEntry[] {
  if (!wordIndex || !readingIndex) buildIndexes();
  return [...(wordIndex!.get(text) ?? []), ...(readingIndex!.get(text) ?? [])];
}

/**
 * 표기가 같은 후보 중 하나를 고른다. **사전 순서를 믿으면 안 된다** — 예전엔 "첫 common"을 집어서 店이
 * てん(접미사), 人이 じん, 上이 かみ로 읽혔다(문제 은행 전수로 확인).
 *
 * 혼자 쓰인 글자면 접사가 아닌 쪽, 한자 바로 뒤면 접사 쪽(韓国人의 人)을 먼저 보고, 그다음 흔한 것 → 낮은 급수.
 */
function pickEntry(candidates: WordEntry[], afterKanji: boolean): WordEntry {
  const score = (c: WordEntry) => {
    const isAffix = c.pos.some((p) => AFFIX_POS.has(p));
    const onlyAffix = c.pos.length > 0 && c.pos.every((p) => AFFIX_POS.has(p));
    const affixScore = afterKanji ? (isAffix ? 0 : 100) : onlyAffix ? 100 : 0;
    // 보통 가나로 쓰는 항목은 한자로 쓴 자리의 답이 아니다 — 彼가 あれ(N5)로 읽혔다. 정답 かれ는 다른 항목이다.
    const kanaWordPenalty = c.usuallyKana ? 50 : 0;
    return affixScore + kanaWordPenalty + (c.common ? 0 : 10) + (c.jlptLevel ? LEVEL_RANK[c.jlptLevel] : 5);
  };
  // sort는 안정 정렬이라 점수가 같으면 사전 순서대로다.
  return [...candidates].sort((a, b) => score(a) - score(b))[0];
}

/** 한자 바로 뒤의 한 글자인데 접사 후보도 없고 읽기가 갈린다 — 今日中의 中처럼 무엇으로 읽을지 모른다. */
function isUnknownAfterKanji(candidates: readonly WordEntry[]): boolean {
  if (candidates.some((c) => c.pos.some((p) => AFFIX_POS.has(p)))) return false;
  return new Set(candidates.map((c) => c.reading)).size > 1;
}

/**
 * 사전에 없는 복합어의 조각(金閣寺의 金·寺, 月火水木의 火)은 글자별 읽기가 거의 틀리다(金 → かね).
 * 한 글자 조각이 다른 한 글자 조각과 붙어 있으면 읽기를 달지 않는다.
 */
function markUnreliableCompounds(segments: SentenceSegment[]) {
  const isBareSingle = (s: SentenceSegment | undefined) =>
    !!s && s.text.length === 1 && KANJI_CHAR.test(s.text) && !s.ruby && !READS_ALONE.has(s.text);
  segments.forEach((s, i) => {
    if (isBareSingle(s) && (isBareSingle(segments[i - 1]) || isBareSingle(segments[i + 1]))) s.noRuby = true;
  });
}

/**
 * LLM이 생성한 일본어 문장을 dictionary.json과 그리디 최장일치로 대조해 클릭 가능한
 * 단어/조사 구간으로 나눈다. 후리가나가 없는 항목(조사 등)까지 전부 포함한 전체 사전을 쓰고
 * 한 글자짜리 매치도 허용한다(は/が/を 같은 조사가 대부분 한 글자라서). 사전에 없는 부분은
 * 클릭 불가능한 원문 그대로 남긴다 — 이 프로젝트 규칙상 단어 뜻은 LLM이 지어내면 안 되고
 * 항상 정적 사전에서만 조회해야 하기 때문이다.
 *
 * 단어로 안 잡히는 나머지 글자 중 한자(예: 활용형이라 사전 표제어와 형태가 다른 開いた의 開)는
 * kanji.json과 대조해 한 글자 단위로 한자 정보만이라도 조회할 수 있게 한다 — 단어 사전에 없다고
 * 아예 클릭 불가로 두면, 이미 한자 페이지에서 학습한 글자인데도 예문에서는 못 눌러보는 게 된다.
 */
export function segmentSentenceIntoWords(text: string): SentenceSegment[] {
  if (!wordIndex || !readingIndex) buildIndexes();

  const segments: SentenceSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const fixed = Object.keys(FIXED_READINGS).find((name) => text.startsWith(name, i));
    if (fixed) {
      segments.push({ text: fixed, word: null, kanji: null, ruby: [{ ruby: fixed, rt: FIXED_READINGS[fixed] }] });
      i += fixed.length;
      continue;
    }

    let matchedLen = 0;
    let matchedEntry: WordEntry | null = null;
    let matchedList: WordEntry[] = [];
    const previous = segments[segments.length - 1];
    const afterKanji = !!previous && KANJI_CHAR.test(previous.text[previous.text.length - 1]);
    const upper = Math.min(maxWordLength, text.length - i);
    for (let len = upper; len >= 1; len--) {
      const candidate = text.slice(i, i + len);
      // **표기를 읽기보다 먼저 본다.** 같은 길이라면 한자로 쓰인 표기가 더 확실한 단서다
      // (읽기가 우연히 겹치는 다른 단어가 있을 수 있다). 길이는 언제나 긴 쪽이 이긴다.
      const list = wordIndex!.get(candidate) ?? readingIndex!.get(candidate);
      if (list) {
        matchedEntry = pickEntry(list, afterKanji);
        matchedList = list;
        matchedLen = len;
        break;
      }
    }

    // 숫자+단위는 사전에 없는 조합이 대부분이다(四時). 사전 표제어(一人·十分)가 같거나 길면 그쪽이 맞다.
    // 앞에 한자가 붙으면 숫자가 아닐 수 있다(再三).
    const number = afterKanji ? null : readNumberPrefix(text.slice(i, i + 12));
    if (number && number.text.length > matchedLen) {
      segments.push({ text: number.text, word: null, kanji: null, ruby: [{ ruby: number.text, rt: number.reading }] });
      i += number.text.length;
      continue;
    }

    // 활용형. 사전 표제어가 한 글자뿐이거나 없으면 어간을 먼저 본다 — 「食べます」의 食이 名詞 食(しょく)로 잡혔다.
    if (matchedLen <= 1) {
      const next = text[i + 1];
      if (text[i] === "来" && next && kuruReading(next)) {
        const kuru = wordIndex!.get("来る")?.[0] ?? null;
        segments.push({ text: "来", word: kuru, kanji: null, ruby: [{ ruby: "来", rt: kuruReading(next)! }] });
        i += 1;
        continue;
      }
    }
    const inflected = findInflected(text, i);
    if (inflected) {
      // 「読みました」처럼 표제어(読み)가 길게 잡히면 읽기가 같으니 그대로 둔다. 다만 入り(いり)·越し(ごし)처럼
      // 명사의 읽기가 동사와 다르면 동사를 쓴다 — 「入ります」가 いります로, 「お越し」가 おごし로 읽혔다.
      const matchedRuby = matchedEntry?.word === text.slice(i, i + matchedLen) ? matchedEntry.furigana : null;
      const differs =
        matchedLen > inflected.length &&
        !KANJI_CHAR.test(text[i + matchedLen] ?? "") && // 뒤에 한자가 이어지면 복합 명사다
        !!matchedRuby?.[0]?.rt &&
        matchedRuby[0].rt !== inflected.ruby[0]?.rt;
      if ((matchedLen <= 1 && inflected.length >= matchedLen) || differs) {
        segments.push({
          text: text.slice(i, i + inflected.length),
          word: inflected.entry,
          kanji: null,
          ruby: inflected.ruby,
          noRuby: inflected.ambiguous,
        });
        i += inflected.length;
        continue;
      }
    }

    if (matchedLen > 0) {
      const matched = text.slice(i, i + matchedLen);
      const segment: SentenceSegment = { text: matched, word: matchedEntry, kanji: null };
      if (afterKanji && matchedLen === 1 && KANJI_CHAR.test(matched) && isUnknownAfterKanji(matchedList)) {
        segment.noRuby = true;
      }
      // 빈칸 바로 앞의 동사 어간(「日本に来＿＿」「行＿＿」)은 뒤 글자를 몰라 읽기를 정할 수 없다.
      if (text[i + 1] === "＿" && (matched === "来" || stemIndex!.has(matched))) segment.noRuby = true;
      // 方은 「〜の方が」(ほう)와 「あの方」(かた)로 갈린다. 비교의 が 앞만 확실하다.
      if (matched === "方") {
        const hou = matchedList.find((c) => c.reading === "ほう");
        if (text[i + 1] === "が" && hou) {
          segment.word = hou;
          segment.ruby = [{ ruby: "方", rt: "ほう" }];
        } else {
          segment.noRuby = true;
        }
      }
      segments.push(segment);
      i += matchedLen;
      continue;
    }

    const kanjiEntry = getKanjiEntry(text[i]);
    if (kanjiEntry) {
      segments.push({ text: text[i], word: null, kanji: kanjiEntry });
      i += 1;
      continue;
    }

    const last = segments[segments.length - 1];
    // 읽기가 붙은 조각(숫자·성씨)에 이어 붙이면 뒤 글자까지 그 읽기 아래로 들어간다.
    if (last && last.word === null && last.kanji === null && !last.ruby) last.text += text[i];
    else segments.push({ text: text[i], word: null, kanji: null });
    i += 1;
  }
  markUnreliableCompounds(segments);
  return segments;
}

/**
 * 이 조각 위에 덧씌울 후리가나. 없으면 null(원문을 글자 그대로 그린다).
 *
 * **표기가 정확히 같을 때만 돌려준다 (실제로 겪은 버그).** 사전 항목의 `furigana`는 그
 * **표제어의 표기**를 설명하는 것이라(為 → ruby:"為", rt:"ため"), 가나로 쓴 자리에 그대로
 * 그리면 화면의 문장이 바뀐다 — 읽기 색인을 넣은 직후 「〜のため、」가 「〜の為ため、」로,
 * 「ください」가 「下ください」로 렌더됐다. 사전 정보를 덧씌우는 것이지 원문을 고치는 게
 * 아니다.
 */
export function rubyFor(segment: SentenceSegment): Furigana[] | null {
  if (segment.noRuby) return null;
  if (segment.ruby) return segment.ruby;
  if (!segment.word?.furigana) return null;
  return segment.text === segment.word.word ? segment.word.furigana : null;
}
