// KanjiVG XML에서 src/data/kanji.json에 있는 한자만 골라 획순 SVG path 데이터를 추출해
// src/data/kanjivg.json을 만든다. 각 path는 문서에 등장하는 순서 그대로 저장하며,
// 이 순서가 곧 KanjiVG의 필순(stroke order)이다.
//
// 좌표계: 모든 path는 KanjiVG 표준 캔버스인 viewBox="0 0 109 109" 기준이다.
//
// 입력:
//   src/data/kanji.json               (build-kanji.mjs로 먼저 생성)
//   scripts/data/.cache/kanjivg.xml    (출처: KanjiVG, CC BY-SA 3.0, download.sh로 준비)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "..", "..", "src", "data");

export const KANJIVG_VIEW_BOX = "0 0 109 109";

function main() {
  const kanjiJsonPath = path.join(OUT_DIR, "kanji.json");
  const xmlPath = path.join(CACHE_DIR, "kanjivg.xml");
  for (const p of [kanjiJsonPath, xmlPath]) {
    if (!fs.existsSync(p)) {
      console.error(`필요한 파일이 없습니다: ${p}`);
      console.error(
        "먼저 실행: bash scripts/data/download.sh && node scripts/data/build-kanji.mjs"
      );
      process.exit(1);
    }
  }

  const kanjiList = JSON.parse(fs.readFileSync(kanjiJsonPath, "utf-8"));
  const wanted = new Set(kanjiList.map((k) => k.kanji));

  const xml = fs.readFileSync(xmlPath, "utf-8");
  const kanjiBlockRe = /<kanji id="kvg:kanji_([0-9a-f]+)">([\s\S]*?)<\/kanji>/g;
  const pathRe = /<path\b[^>]*\bd="([^"]+)"/g;

  const result = {};
  let match;
  while ((match = kanjiBlockRe.exec(xml))) {
    const char = String.fromCodePoint(parseInt(match[1], 16));
    if (!wanted.has(char)) continue;

    const block = match[2];
    const strokes = [];
    pathRe.lastIndex = 0;
    let pm;
    while ((pm = pathRe.exec(block))) strokes.push(pm[1]);

    if (strokes.length > 0) result[char] = strokes;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "kanjivg.json"), JSON.stringify(result));

  const missing = [...wanted].filter((c) => !result[c]);
  console.log(
    `kanjivg.json: ${Object.keys(result).length}/${wanted.size}자 (viewBox ${KANJIVG_VIEW_BOX})`
  );
  if (missing.length > 0) {
    console.log(
      `획순 데이터 없는 한자 ${missing.length}자: ${missing.slice(0, 20).join(" ")}${
        missing.length > 20 ? " ..." : ""
      }`
    );
  }
}

main();
