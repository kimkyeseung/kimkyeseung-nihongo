// JMDict_Extended(사전+JLPT급수+후리가나)에서 JLPT 태그가 붙은 항목 + 흔한 단어(common) + 조사 +
// EXTRA_WORDS만 추출해
// src/data/dictionary.json (경량 서브셋) 과 src/data/pos-tags.json (품사 코드 설명)을 만든다.
//
// 입력: scripts/data/.cache/jmdictExtended.json (download.sh로 준비)
// 출처: https://github.com/Bluskyo/JMDict_Extended (MIT + CC BY-SA, LICENSE-DATA.md 참고)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "..", "..", "src", "data");

const JLPT_LABELS = { 1: "N1", 2: "N2", 3: "N3", 4: "N4", 5: "N5" };

/**
 * 급수도 없고 JMDict의 common 표시도 없지만 사전에 있어야 하는 단어(표기 또는 읽기).
 *
 * 처음엔 JLPT 태그가 붙은 단어만 실었는데(8,405개) しょっぱい 같은 일상어가 빠진다는
 * 보고를 받았다. common(뉴스·ichi 빈도 표시)을 더해 대부분은 채웠지만, しょっぱい처럼
 * **누구나 쓰는데 빈도 표시가 없는 단어**가 여전히 있다. 빠졌다는 보고가 오면 여기에 더할 것.
 */
const EXTRA_WORDS = new Set(["しょっぱい"]);

function readJson(file) {
  let raw = fs.readFileSync(file, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM 제거
  return JSON.parse(raw);
}

function pickPrimary(forms) {
  if (!forms || forms.length === 0) return null;
  return forms.find((f) => f.common) ?? forms[0];
}

const HANGUL = /[가-힣]/;
/** 한국어 뜻은 최대 이만큼만 싣는다 — 사전 파일 용량과 화면 길이 둘 다를 위해. */
const MAX_KOREAN_GLOSSES = 4;

/**
 * 한국어 위키낱말사전(kaikki.org 가공본)에서 **표기 → 한국어 뜻** 사전을 만든다.
 *
 * **읽기(가나)로는 매칭하지 않는다 (실측해서 내린 결론).** 원본에는 한자 표기와 읽기를 잇는
 * 정보가 사실상 없어서(13,629개 중 읽기가 달린 한자 표제어가 469개뿐), 읽기로 이으면 동음이의어에
 * 엉뚱한 뜻이 붙는다. 표본 19개를 눈으로 확인했을 때 5개가 오답이었다:
 *   下吏(かり) → "사냥"(狩り) / 協会(きょうかい) → "교회"(教会) / 宝器(ほうき) → "빗자루"(箒)
 * 품사로 후보를 좁히는 것도 시도했지만 卯(う) → "あ행의 3번째 문자"처럼 더 나빠졌다.
 * 커버리지(61% → 47%)를 잃더라도 **틀린 뜻을 싣지 않는 쪽**을 택한다 — 사전적 사실은 지어내지
 * 않는다는 이 프로젝트의 규칙과 같은 이유다.
 */
function loadKoreanGlosses(file) {
  if (!fs.existsSync(file)) {
    console.warn(`(건너뜀) 한국어 뜻풀이 원본이 없습니다: ${file}`);
    console.warn("  한국어 뜻 없이 빌드합니다. 받으려면: bash scripts/data/download.sh");
    return new Map();
  }

  const byWord = new Map();
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    const glosses = [];
    for (const sense of entry.senses ?? []) {
      for (const raw of sense.glosses ?? []) {
        const gloss = raw.trim().replace(/\.+$/, "").trim();
        if (!gloss) continue;
        // 한글이 없는 뜻풀이는 버린다 — 표제어를 그대로 되풀이한 것(何時か → "何時か")이나
        // 일본어 설명만 남은 항목이 섞여 있다.
        if (!HANGUL.test(gloss)) continue;
        glosses.push(gloss);
      }
    }
    if (glosses.length === 0) continue;
    const prev = byWord.get(entry.word) ?? [];
    byWord.set(entry.word, [...prev, ...glosses]);
  }

  // 같은 표기에 여러 항목이 있으면(동음이의) 뜻을 합쳐서 싣는다 — 어느 쪽이 맞는지 고를
  // 근거가 없으니 고르지 않는다.
  for (const [word, glosses] of byWord) {
    byWord.set(word, [...new Set(glosses)].slice(0, MAX_KOREAN_GLOSSES));
  }
  return byWord;
}

function main() {
  const srcPath = path.join(CACHE_DIR, "jmdictExtended.json");
  if (!fs.existsSync(srcPath)) {
    console.error(`소스 파일이 없습니다: ${srcPath}`);
    console.error("먼저 실행: bash scripts/data/download.sh");
    process.exit(1);
  }

  const data = readJson(srcPath);
  const koreanGlosses = loadKoreanGlosses(path.join(CACHE_DIR, "ko-wiktionary-ja.jsonl"));
  const usedPosCodes = new Set();
  const entries = [];

  for (const w of data.words) {
    const kanjiForms = w.kanji ?? [];
    const kanaForms = w.kana ?? [];

    // 한자 표기와 가나 표기의 JLPT 태그가 다를 수 있어, 한자 표기 쪽을 우선한다
    const level =
      kanjiForms.find((k) => k.jlptLevel)?.jlptLevel ??
      kanaForms.find((k) => k.jlptLevel)?.jlptLevel;

    // は/が/を/に 같은 조사는 원본 JMDict_Extended에 JLPT 태그가 거의 안 붙어있어(전수 조사 결과
    // 138개) level만으로 거르면 예문/회화 문장에서 조사를 전혀 조회할 수 없다. 품사(prt)로
    // 예외적으로 포함시키고, 실제로 가장 기초 문법이므로 N5로 간주한다.
    const isParticle = (w.sense ?? []).some((s) => s.partOfSpeech?.includes("prt"));
    // 급수가 없어도 흔한 단어(common, 약 1만 5천 개)는 싣는다 — 급수 목록만으로는 일상어가
    // 숭숭 빠진다. 그 밖의 항목(약 20만 개)은 용량 때문에 뺀다(EXTRA_WORDS 참고).
    const isCommon = [...kanjiForms, ...kanaForms].some((f) => f.common);
    const isExtra = [...kanjiForms, ...kanaForms].some((f) => EXTRA_WORDS.has(f.text));
    if (!level && !isParticle && !isCommon && !isExtra) continue;

    const primaryKanji = pickPrimary(kanjiForms);
    const primaryKana = pickPrimary(kanaForms);
    // 조사(の 등)는 乃/之처럼 JMDict에 딸려있는 희귀/고어 한자 표기가 있어도 실제로는
    // 항상 가나로만 쓰므로, word 선택에서 한자보다 가나를 우선한다(일반 단어는 기존 로직 유지).
    const word = isParticle
      ? (primaryKana?.text ?? primaryKanji?.text)
      : (primaryKanji?.text ?? primaryKana?.text);
    const reading = primaryKana?.text ?? primaryKanji?.text;
    if (!word || !reading) continue;

    const rawSenses = (w.sense ?? []).filter((s) => s.gloss?.some((g) => g.lang === "eng"));
    const senses = rawSenses.map((s) => {
      for (const p of s.partOfSpeech) usedPosCodes.add(p);
      return {
        pos: s.partOfSpeech,
        glosses: s.gloss.filter((g) => g.lang === "eng").map((g) => g.text),
      };
    });
    if (senses.length === 0) continue;

    /**
     * JMDict의 `uk`(usually written using kana alone) 태그. **표기는 한자인데 실제로는
     * 가나로 쓰는 단어**(為 → ため, 事 → こと)를 가려낸다.
     *
     * 왜 필요한가: 문장을 클릭 가능한 단어로 쪼갤 때(sentenceWords.ts) 표기만으로 찾으면
     * 「〜のため」의 ため가 안 잡혀 조동사 た가 걸린다. 그렇다고 모든 읽기를 색인에 넣으면
     * ます→増す, した→舌처럼 **활용 어미가 엉뚱한 명사로** 잡힌다. `uk`가 붙은 항목만
     * 읽기로도 찾게 하면 둘 다 피한다.
     *
     * **첫 번째 뜻에 붙었을 때만 참으로 본다 (실제로 확인하고 고친 판정).** "하나라도 있으면"
     * 으로 하면 島가 걸린다 — 島는 sense0이 "island"(한자로 쓴다)이고 uk는 은어인 "구역"
     * 뜻에만 붙어 있다. 그 탓에 「勉強します」의 しま가 島로 잡혔다. 物도 같은 경우다.
     * 반면 為·事·彼処·下さい는 첫 뜻부터 uk다.
     */
    const usuallyKana = Boolean(rawSenses[0]?.misc?.includes("uk"));

    // 표기가 정확히 같을 때만 붙인다(loadKoreanGlosses 주석 참고).
    const koreanMeaning = koreanGlosses.get(word);

    entries.push({
      id: w.id,
      word,
      reading,
      // 조사는 급수 태그가 거의 없지만 가장 기초 문법이라 N5로 본다. 그 밖의 급수 없는 단어는
      // null — **급수를 지어내지 않는다**(사전적 사실이라 화면·진도 계산이 그대로 믿는다).
      jlptLevel: level ? JLPT_LABELS[level] : isParticle ? "N5" : null,
      common: Boolean(primaryKanji?.common || primaryKana?.common),
      furigana: word === primaryKanji?.text ? (primaryKanji?.furigana ?? null) : null,
      pos: senses[0].pos,
      meaning: senses[0].glosses[0],
      // 표기가 이미 가나면 읽기 색인에 넣을 이유가 없으니 플래그도 달지 않는다(용량 절감).
      ...(usuallyKana && word !== reading ? { usuallyKana: true } : {}),
      ...(koreanMeaning ? { koreanMeaning } : {}),
      senses,
    });
  }

  // 급수 있는 단어가 앞, 급수 없는 단어가 뒤다. 같은 점수끼리는 이 순서가 그대로 남는 곳이 있어서
  // (한자 상세의 "활용 단어") 급수 단어가 먼저 보인다.
  entries.sort(
    (a, b) =>
      (a.jlptLevel ?? "N9").localeCompare(b.jlptLevel ?? "N9") ||
      a.word.localeCompare(b.word, "ja")
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "dictionary.json"), JSON.stringify(entries));

  const posTags = {};
  for (const code of usedPosCodes) {
    if (data.tags[code]) posTags[code] = data.tags[code];
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "pos-tags.json"),
    JSON.stringify(posTags, null, 2)
  );

  const byLevel = {};
  for (const e of entries) byLevel[e.jlptLevel ?? "급수 외"] = (byLevel[e.jlptLevel ?? "급수 외"] ?? 0) + 1;

  const koCount = entries.filter((e) => e.koreanMeaning).length;
  const koByLevel = {};
  for (const e of entries)
    if (e.koreanMeaning) koByLevel[e.jlptLevel ?? "급수 외"] = (koByLevel[e.jlptLevel ?? "급수 외"] ?? 0) + 1;

  console.log(`dictionary.json: 총 ${entries.length}개 단어`);
  console.log(byLevel);
  console.log(
    `한국어 뜻: ${koCount}개 (${((koCount / entries.length) * 100).toFixed(1)}%)`,
    Object.fromEntries(
      Object.keys(byLevel).sort().map((lv) => [lv, `${koByLevel[lv] ?? 0}/${byLevel[lv]}`])
    )
  );
  console.log(`pos-tags.json: ${Object.keys(posTags).length}개 품사 태그`);
}

main();
