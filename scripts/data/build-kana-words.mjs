// 오십음도의 글자마다 "대표 단어"를 골라 src/data/kana-words.json을 만든다.
// 단어/읽기/뜻은 사전적 사실이라 LLM으로 짓지 않고 JMDict 가공본(dictionary.json)에서만 고른다.
// 오십음도 페이지가 2.9MB짜리 dictionary.json 청크를 통째로 끌어오지 않도록, 필요한 글자분만
// 미리 뽑아 작은 JSON으로 떨궈두는 것이 이 스크립트의 목적이다.
//
// 입력:
//   src/data/dictionary.json   (build-dictionary.mjs로 먼저 생성)
//   src/data/gojuon.ts         (글자 목록의 유일한 출처 — cell(...) 호출을 그대로 읽는다)
// 출력:
//   src/data/kana-words.json
//   src/data/kana-homophones.json  (발음 게임 채점용 — 읽기가 그 글자 하나와 같은 단어의 표기)
//
// 실행: node scripts/data/build-kana-words.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/data");

const JLPT_ORDER = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
const KATAKANA_ONLY = /^[ァ-ヴー]+$/;
/**
 * 작은 가나. "り"의 예시를 고를 때 "旅行(りょこう)"가 걸리면 안 된다 — 첫 박자가 り가 아니라
 * 요음 りょ라서 그 글자의 예시로는 틀렸다. 한 글자짜리 칸은 뒤에 작은 가나가 오는 단어를 뺀다.
 */
const SMALL_KANA = /^[ぁぃぅぇぉゃゅょァィゥェォャュョ]/;

/**
 * 자동 선정이 어색한 글자만 손으로 지정한다(사전에 후보가 거의 없거나, 뽑힌 단어가 학습자에게
 * 너무 낯선 경우). 값은 dictionary.json의 id.
 */
const OVERRIDES = {
  // ん으로 "시작하는" 단어는 없다 — 이 글자만 ん이 들어간 단어에서 고른다.
  ん: { match: "contains", hiragana: "1522150" /* 本 */, katakana: "1103090" /* パン */ },
  // 자동 선정이 추상적인 한자어(報·動)나 낯선 표현(ゆえ·訳·下手)을 골라서 흔한 명사로 바꿨다.
  ほ: { hiragana: "1376310" /* 星 */ },
  ゆ: { hiragana: "1386500" /* 雪 */ },
  わ: { hiragana: "1311110" /* 私 */ },
  へ: { hiragana: "1499320" /* 部屋 */ },
  ど: { hiragana: "1451470" /* 動物 */ },
  // 작은 ヵ・ヶ로 "시작하는" 단어는 없다 — 一ヶ月처럼 들어 있는 단어에서 고른다.
  ゕ: { match: "contains" },
  ゖ: { match: "contains" },
};

function readKanaCells() {
  const source = fs.readFileSync(path.join(OUT_DIR, "gojuon.ts"), "utf-8");
  const cells = [];
  // special(...)은 가타카나 전용 칸(ファ·ヶ…) — 네 번째 인자(설명 등)가 올 수 있어 닫는 괄호는 안 본다.
  const re = /\b(cell|special)\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(source))) {
    cells.push({
      hiragana: match[2],
      katakana: match[3],
      romaji: match[4],
      katakanaOnly: match[1] === "special",
    });
  }
  return cells;
}

/** 가타카나를 히라가나로(코드포인트 이동). 사전의 외래어 읽기는 가타카나로 들어 있다. */
const toHiraganaReading = (text) =>
  text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/** 발음 게임 채점에 쓸 동음어를 글자당 최대 몇 개까지 싣는가. */
const HOMOPHONE_LIMIT = 60;

/**
 * 발음 게임용 동음어 표. 음성 인식기는 "か" 한 글자를 蚊·課·可처럼 **한자로** 돌려주는 일이
 * 흔해서(て → 手, に → 二), 그 표기의 읽기를 알아야 맞게 읽었는지 판단할 수 있다. 읽기는 사전
 * 정보라 여기서 dictionary.json으로 미리 뽑는다 — 오십음도가 2.9MB 사전을 불러오지 않도록.
 * 표기가 가나뿐인 항목은 뺀다(가나는 채점 쪽에서 읽기 그대로 비교한다).
 */
function buildHomophones(dictionary, cells) {
  const keys = new Set(cells.map((cell) => cell.hiragana));
  const result = {};
  for (const key of keys) result[key] = [];
  for (const entry of dictionary) {
    const key = toHiraganaReading(entry.reading);
    const list = result[key];
    if (!list || /^[\u3040-\u30ffー]+$/.test(entry.word)) continue;
    if (list.length < HOMOPHONE_LIMIT && !list.includes(entry.word)) list.push(entry.word);
  }
  for (const key of Object.keys(result)) if (result[key].length === 0) delete result[key];
  return result;
}

/** 글자 하나당 보여줄 대표 단어 수. */
const LIMIT = 5;

/** 학습자에게 도움이 되는 순서로 정렬해 앞에서 LIMIT개를 고른다(같은 표기는 한 번만). */
function pickBest(candidates) {
  const sorted = candidates.sort((a, b) => {
    // 흔히 쓰는 단어 > 명사(뜻이 구체적이라 예시로 좋다) > 낮은 JLPT 급수 > 짧은 읽기
    if (a.common !== b.common) return a.common ? -1 : 1;
    const aNoun = a.pos.includes("n");
    const bNoun = b.pos.includes("n");
    if (aNoun !== bNoun) return aNoun ? -1 : 1;
    const jlpt = (JLPT_ORDER[a.jlptLevel] ?? 9) - (JLPT_ORDER[b.jlptLevel] ?? 9);
    if (jlpt !== 0) return jlpt;
    if (a.reading.length !== b.reading.length) return a.reading.length - b.reading.length;
    return a.id.localeCompare(b.id); // 데이터가 바뀌어도 결과가 흔들리지 않도록 마지막 기준은 id
  });

  const picked = [];
  const seen = new Set();
  for (const entry of sorted) {
    if (seen.has(entry.word)) continue; // 같은 표기의 다른 뜻(예: 飴/飴)이 목록을 채우지 않게
    seen.add(entry.word);
    picked.push(toEntry(entry));
    if (picked.length === LIMIT) break;
  }
  return picked;
}

function toEntry(word) {
  // 한국어 뜻은 있을 때만 싣는다(전체의 약 47%). 없으면 화면이 영어 meaning으로 폴백한다.
  return {
    id: word.id,
    word: word.word,
    reading: word.reading,
    meaning: word.meaning,
    ...(word.koreanMeaning ? { koreanMeaning: word.koreanMeaning } : {}),
  };
}

function main() {
  const dictionary = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "dictionary.json"), "utf-8"));
  const byId = new Map(dictionary.map((entry) => [entry.id, entry]));
  const usable = dictionary.filter((entry) => entry.meaning);

  const result = {};
  let missing = 0;
  const cells = readKanaCells();

  for (const cell of cells) {
    const override = OVERRIDES[cell.hiragana] ?? {};
    const matchesCell = (text, kana) =>
      override.match === "contains"
        ? text.includes(kana)
        : text.startsWith(kana) && !(kana.length === 1 && SMALL_KANA.test(text.slice(1)));

    // override는 자동 선정이 어색한 글자의 "첫 번째 단어"만 지정한다 — 나머지는 그대로 자동.
    const withOverride = (id, picked) => {
      if (!id) return picked;
      const forced = toEntry(byId.get(id));
      return [forced, ...picked.filter((w) => w.word !== forced.word)].slice(0, LIMIT);
    };

    // 가타카나 전용 칸은 히라가나 쪽 단어가 없다(화면도 가타카나 모드에서만 보여준다).
    const hiragana = cell.katakanaOnly
      ? []
      : withOverride(
          override.hiragana,
          pickBest(
            usable.filter(
              (e) => matchesCell(e.reading, cell.hiragana) && !KATAKANA_ONLY.test(e.word)
            )
          )
        );
    // 가타카나 쪽은 외래어(가타카나로만 쓰는 단어)를 고른다 — 가타카나를 실제로 만나는 자리다.
    // 가타카나 전용 칸은 예외로 표기만 본다 — ヶ는 一ヶ月처럼 한자와 섞여서만 쓰인다.
    const katakana = withOverride(
      override.katakana,
      pickBest(
        usable.filter(
          (e) =>
            matchesCell(e.word, cell.katakana) && (cell.katakanaOnly || KATAKANA_ONLY.test(e.word))
        )
      )
    );

    if (hiragana.length === 0 && katakana.length === 0) missing += 1;
    result[cell.hiragana] = { hiragana, katakana };
  }

  fs.writeFileSync(path.join(OUT_DIR, "kana-words.json"), JSON.stringify(result));
  const count = Object.keys(result).length;
  console.log(`kana-words.json: ${count}자 (둘 다 못 찾은 글자 ${missing}자)`);

  const homophones = buildHomophones(dictionary, cells);
  fs.writeFileSync(path.join(OUT_DIR, "kana-homophones.json"), JSON.stringify(homophones));
  console.log(`kana-homophones.json: ${Object.keys(homophones).length}자`);
}

main();
