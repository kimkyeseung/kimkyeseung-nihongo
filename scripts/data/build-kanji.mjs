// KANJIDIC2(음독/훈독/뜻/획수) + JLPT 한자 급수 목록을 병합해 src/data/kanji.json을 만든다.
//
// 입력:
//   scripts/data/.cache/kanjidic2-en.json  (출처: scriptin/jmdict-simplified, EDRDG KANJIDIC2 재가공, CC BY-SA)
//   scripts/data/.cache/jlpt-kanji.json    (출처: AnchorI/jlpt-kanji-dictionary)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "..", "..", "src", "data");

const LEVEL_ORDER = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

function readJson(file) {
  let raw = fs.readFileSync(file, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

function main() {
  const kanjidic2Path = path.join(CACHE_DIR, "kanjidic2-en.json");
  const jlptPath = path.join(CACHE_DIR, "jlpt-kanji.json");
  for (const p of [kanjidic2Path, jlptPath]) {
    if (!fs.existsSync(p)) {
      console.error(`소스 파일이 없습니다: ${p}`);
      console.error("먼저 실행: bash scripts/data/download.sh");
      process.exit(1);
    }
  }

  const kanjidic2 = readJson(kanjidic2Path);
  const jlptList = readJson(jlptPath);

  const jlptByChar = new Map();
  for (const k of jlptList) {
    if (k.jlpt) jlptByChar.set(k.kanji, k.jlpt);
  }

  const byChar = new Map(kanjidic2.characters.map((c) => [c.literal, c]));

  const entries = [];
  for (const [char, jlptLevel] of jlptByChar) {
    const c = byChar.get(char);
    if (!c) continue;
    const group = c.readingMeaning?.groups?.[0];
    const readings = group?.readings ?? [];

    entries.push({
      kanji: char,
      jlptLevel,
      strokeCount: c.misc?.strokeCounts?.[0] ?? null,
      grade: c.misc?.grade ?? null,
      frequency: c.misc?.frequency ?? null,
      onyomi: readings.filter((r) => r.type === "ja_on").map((r) => r.value),
      kunyomi: readings.filter((r) => r.type === "ja_kun").map((r) => r.value),
      meaning: group?.meanings?.filter((m) => m.lang === "en").map((m) => m.value) ?? [],
    });
  }

  entries.sort(
    (a, b) =>
      LEVEL_ORDER[a.jlptLevel] - LEVEL_ORDER[b.jlptLevel] ||
      (a.frequency ?? 9999) - (b.frequency ?? 9999)
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "kanji.json"), JSON.stringify(entries));

  const byLevel = {};
  for (const e of entries) byLevel[e.jlptLevel] = (byLevel[e.jlptLevel] ?? 0) + 1;

  console.log(`kanji.json: 총 ${entries.length}자`);
  console.log(byLevel);
}

main();
