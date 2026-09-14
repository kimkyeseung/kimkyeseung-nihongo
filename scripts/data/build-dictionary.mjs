// JMDict_Extended(사전+JLPT급수+후리가나)에서 JLPT 태그가 붙은 항목만 추출해
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

function readJson(file) {
  let raw = fs.readFileSync(file, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM 제거
  return JSON.parse(raw);
}

function pickPrimary(forms) {
  if (!forms || forms.length === 0) return null;
  return forms.find((f) => f.common) ?? forms[0];
}

function main() {
  const srcPath = path.join(CACHE_DIR, "jmdictExtended.json");
  if (!fs.existsSync(srcPath)) {
    console.error(`소스 파일이 없습니다: ${srcPath}`);
    console.error("먼저 실행: bash scripts/data/download.sh");
    process.exit(1);
  }

  const data = readJson(srcPath);
  const usedPosCodes = new Set();
  const entries = [];

  for (const w of data.words) {
    const kanjiForms = w.kanji ?? [];
    const kanaForms = w.kana ?? [];

    // 한자 표기와 가나 표기의 JLPT 태그가 다를 수 있어, 한자 표기 쪽을 우선한다
    const level =
      kanjiForms.find((k) => k.jlptLevel)?.jlptLevel ??
      kanaForms.find((k) => k.jlptLevel)?.jlptLevel;
    if (!level) continue; // JLPT 급수 태그 없는 항목은 제외 (용량 절감)

    const primaryKanji = pickPrimary(kanjiForms);
    const primaryKana = pickPrimary(kanaForms);
    const word = primaryKanji?.text ?? primaryKana?.text;
    const reading = primaryKana?.text ?? primaryKanji?.text;
    if (!word || !reading) continue;

    const senses = (w.sense ?? [])
      .filter((s) => s.gloss?.some((g) => g.lang === "eng"))
      .map((s) => {
        for (const p of s.partOfSpeech) usedPosCodes.add(p);
        return {
          pos: s.partOfSpeech,
          glosses: s.gloss.filter((g) => g.lang === "eng").map((g) => g.text),
        };
      });
    if (senses.length === 0) continue;

    entries.push({
      id: w.id,
      word,
      reading,
      jlptLevel: JLPT_LABELS[level],
      common: Boolean(primaryKanji?.common || primaryKana?.common),
      furigana: primaryKanji?.furigana ?? null,
      pos: senses[0].pos,
      meaning: senses[0].glosses[0],
      senses,
    });
  }

  entries.sort(
    (a, b) =>
      a.jlptLevel.localeCompare(b.jlptLevel) || a.word.localeCompare(b.word, "ja")
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
  for (const e of entries) byLevel[e.jlptLevel] = (byLevel[e.jlptLevel] ?? 0) + 1;

  console.log(`dictionary.json: 총 ${entries.length}개 단어`);
  console.log(byLevel);
  console.log(`pos-tags.json: ${Object.keys(posTags).length}개 품사 태그`);
}

main();
