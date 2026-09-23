// 오십음도(五十音図) 정적 데이터: 청음/탁음/반탁음/요음 + 가타카나 전용 특수 표기.
// 사전적 사실(문자/발음 표기)이라 LLM으로 생성하지 않고 직접 정의한다.
export interface KanaCell {
  /**
   * 히라가나 표기. 가타카나 전용 칸(`katakanaOnly`)에서는 화면에 쓰지 않고, 대표 단어
   * (kana-words.json)와 학습 기록을 찾는 키로만 쓴다(ふぁ·ゔ·ゖ처럼 같은 소리의 히라가나).
   */
  hiragana: string;
  katakana: string;
  romaji: string;
  /** 외래어 표기(ファ·ティ…)나 작은 ヵ・ヶ처럼 가타카나로만 쓰는 칸. */
  katakanaOnly?: boolean;
  /** 발음 엔진에 대신 넘길 글자 — 작은 ヵ・ヶ는 그대로 읽히면 엉뚱한 소리가 난다. */
  speech?: string;
  /** 상세 다이얼로그에 붙는 한 줄 설명. */
  note?: string;
}

/** 오십음도에서 지금 보고 있는 문자 체계. */
export type ScriptMode = "hiragana" | "katakana";

/**
 * 오십음도 화면의 탭. `special`(특수)은 가타카나 전용이라 가타카나 모드에서만 보인다.
 * 반탁음은 따로 탭을 두지 않고 탁음 탭에 같이 넣는다.
 */
export type KanaTab = "seion" | "dakuon" | "youon" | "special";

export interface KanaSection {
  id: string;
  tab: KanaTab;
  label: string;
  columnHeaders: string[];
  rows: { rowLabel: string; cells: (KanaCell | null)[] }[];
}

const cell = (hiragana: string, katakana: string, romaji: string): KanaCell => ({
  hiragana,
  katakana,
  romaji,
});

// scripts/data/build-kana-words.mjs가 `cell(...)`/`special(...)` 호출을 정규식으로 읽는다 —
// 앞의 세 인자는 반드시 문자열 리터럴로 둘 것.
const special = (
  hiragana: string,
  katakana: string,
  romaji: string,
  extra: Pick<KanaCell, "speech" | "note"> = {}
): KanaCell => ({ hiragana, katakana, romaji, katakanaOnly: true, ...extra });

export const GOJUON_SECTIONS: KanaSection[] = [
  {
    id: "seion",
    tab: "seion",
    label: "청음 (清音)",
    columnHeaders: ["a", "i", "u", "e", "o"],
    rows: [
      { rowLabel: "", cells: [cell("あ", "ア", "a"), cell("い", "イ", "i"), cell("う", "ウ", "u"), cell("え", "エ", "e"), cell("お", "オ", "o")] },
      { rowLabel: "k", cells: [cell("か", "カ", "ka"), cell("き", "キ", "ki"), cell("く", "ク", "ku"), cell("け", "ケ", "ke"), cell("こ", "コ", "ko")] },
      { rowLabel: "s", cells: [cell("さ", "サ", "sa"), cell("し", "シ", "shi"), cell("す", "ス", "su"), cell("せ", "セ", "se"), cell("そ", "ソ", "so")] },
      { rowLabel: "t", cells: [cell("た", "タ", "ta"), cell("ち", "チ", "chi"), cell("つ", "ツ", "tsu"), cell("て", "テ", "te"), cell("と", "ト", "to")] },
      { rowLabel: "n", cells: [cell("な", "ナ", "na"), cell("に", "ニ", "ni"), cell("ぬ", "ヌ", "nu"), cell("ね", "ネ", "ne"), cell("の", "ノ", "no")] },
      { rowLabel: "h", cells: [cell("は", "ハ", "ha"), cell("ひ", "ヒ", "hi"), cell("ふ", "フ", "fu"), cell("へ", "ヘ", "he"), cell("ほ", "ホ", "ho")] },
      { rowLabel: "m", cells: [cell("ま", "マ", "ma"), cell("み", "ミ", "mi"), cell("む", "ム", "mu"), cell("め", "メ", "me"), cell("も", "モ", "mo")] },
      { rowLabel: "y", cells: [cell("や", "ヤ", "ya"), null, cell("ゆ", "ユ", "yu"), null, cell("よ", "ヨ", "yo")] },
      { rowLabel: "r", cells: [cell("ら", "ラ", "ra"), cell("り", "リ", "ri"), cell("る", "ル", "ru"), cell("れ", "レ", "re"), cell("ろ", "ロ", "ro")] },
      { rowLabel: "w", cells: [cell("わ", "ワ", "wa"), null, null, null, cell("を", "ヲ", "wo")] },
      { rowLabel: "", cells: [cell("ん", "ン", "n"), null, null, null, null] },
    ],
  },
  {
    id: "dakuon",
    tab: "dakuon",
    label: "탁음 (濁音)",
    columnHeaders: ["a", "i", "u", "e", "o"],
    rows: [
      { rowLabel: "g", cells: [cell("が", "ガ", "ga"), cell("ぎ", "ギ", "gi"), cell("ぐ", "グ", "gu"), cell("げ", "ゲ", "ge"), cell("ご", "ゴ", "go")] },
      { rowLabel: "z", cells: [cell("ざ", "ザ", "za"), cell("じ", "ジ", "ji"), cell("ず", "ズ", "zu"), cell("ぜ", "ゼ", "ze"), cell("ぞ", "ゾ", "zo")] },
      { rowLabel: "d", cells: [cell("だ", "ダ", "da"), cell("ぢ", "ヂ", "ji"), cell("づ", "ヅ", "zu"), cell("で", "デ", "de"), cell("ど", "ド", "do")] },
      { rowLabel: "b", cells: [cell("ば", "バ", "ba"), cell("び", "ビ", "bi"), cell("ぶ", "ブ", "bu"), cell("べ", "ベ", "be"), cell("ぼ", "ボ", "bo")] },
    ],
  },
  {
    id: "handakuon",
    tab: "dakuon",
    label: "반탁음 (半濁音)",
    columnHeaders: ["a", "i", "u", "e", "o"],
    rows: [
      { rowLabel: "p", cells: [cell("ぱ", "パ", "pa"), cell("ぴ", "ピ", "pi"), cell("ぷ", "プ", "pu"), cell("ぺ", "ペ", "pe"), cell("ぽ", "ポ", "po")] },
    ],
  },
  {
    id: "youon",
    tab: "youon",
    label: "요음 (拗音)",
    columnHeaders: ["ya", "yu", "yo"],
    rows: [
      { rowLabel: "ky", cells: [cell("きゃ", "キャ", "kya"), cell("きゅ", "キュ", "kyu"), cell("きょ", "キョ", "kyo")] },
      { rowLabel: "sh", cells: [cell("しゃ", "シャ", "sha"), cell("しゅ", "シュ", "shu"), cell("しょ", "ショ", "sho")] },
      { rowLabel: "ch", cells: [cell("ちゃ", "チャ", "cha"), cell("ちゅ", "チュ", "chu"), cell("ちょ", "チョ", "cho")] },
      { rowLabel: "ny", cells: [cell("にゃ", "ニャ", "nya"), cell("にゅ", "ニュ", "nyu"), cell("にょ", "ニョ", "nyo")] },
      { rowLabel: "hy", cells: [cell("ひゃ", "ヒャ", "hya"), cell("ひゅ", "ヒュ", "hyu"), cell("ひょ", "ヒョ", "hyo")] },
      { rowLabel: "my", cells: [cell("みゃ", "ミャ", "mya"), cell("みゅ", "ミュ", "myu"), cell("みょ", "ミョ", "myo")] },
      { rowLabel: "ry", cells: [cell("りゃ", "リャ", "rya"), cell("りゅ", "リュ", "ryu"), cell("りょ", "リョ", "ryo")] },
      { rowLabel: "gy", cells: [cell("ぎゃ", "ギャ", "gya"), cell("ぎゅ", "ギュ", "gyu"), cell("ぎょ", "ギョ", "gyo")] },
      { rowLabel: "j", cells: [cell("じゃ", "ジャ", "ja"), cell("じゅ", "ジュ", "ju"), cell("じょ", "ジョ", "jo")] },
      { rowLabel: "by", cells: [cell("びゃ", "ビャ", "bya"), cell("びゅ", "ビュ", "byu"), cell("びょ", "ビョ", "byo")] },
      { rowLabel: "py", cells: [cell("ぴゃ", "ピャ", "pya"), cell("ぴゅ", "ピュ", "pyu"), cell("ぴょ", "ピョ", "pyo")] },
    ],
  },
  // ── 가타카나 전용: 외래어를 적으려고 작은 ァィゥェォュ를 붙여 만든 표기(内閣告示「外来語の表記」)
  {
    id: "gairaigo",
    tab: "special",
    label: "외래어 표기 (外来語)",
    columnHeaders: ["a", "i", "u", "e", "o"],
    rows: [
      { rowLabel: "f", cells: [special("ふぁ", "ファ", "fa"), special("ふぃ", "フィ", "fi"), null, special("ふぇ", "フェ", "fe"), special("ふぉ", "フォ", "fo")] },
      { rowLabel: "v", cells: [special("ゔぁ", "ヴァ", "va"), special("ゔぃ", "ヴィ", "vi"), special("ゔ", "ヴ", "vu"), special("ゔぇ", "ヴェ", "ve"), special("ゔぉ", "ヴォ", "vo")] },
      { rowLabel: "w", cells: [null, special("うぃ", "ウィ", "wi"), null, special("うぇ", "ウェ", "we"), special("うぉ", "ウォ", "wo")] },
      { rowLabel: "ts", cells: [special("つぁ", "ツァ", "tsa"), special("つぃ", "ツィ", "tsi"), null, special("つぇ", "ツェ", "tse"), special("つぉ", "ツォ", "tso")] },
      { rowLabel: "kw", cells: [special("くぁ", "クァ", "kwa"), special("くぃ", "クィ", "kwi"), null, special("くぇ", "クェ", "kwe"), special("くぉ", "クォ", "kwo")] },
      { rowLabel: "t", cells: [null, special("てぃ", "ティ", "ti"), special("とぅ", "トゥ", "tu"), null, null] },
      { rowLabel: "d", cells: [null, special("でぃ", "ディ", "di"), special("どぅ", "ドゥ", "du"), null, null] },
      { rowLabel: "sh", cells: [null, null, null, special("しぇ", "シェ", "she"), null] },
      { rowLabel: "j", cells: [null, null, null, special("じぇ", "ジェ", "je"), null] },
      { rowLabel: "ch", cells: [null, null, null, special("ちぇ", "チェ", "che"), null] },
      { rowLabel: "y", cells: [null, null, null, special("いぇ", "イェ", "ye"), null] },
    ],
  },
  {
    id: "gairaigo-yu",
    tab: "special",
    label: "외래어 표기 — ュ 계열",
    columnHeaders: ["yu"],
    rows: [
      { rowLabel: "t", cells: [special("てゅ", "テュ", "tyu")] },
      { rowLabel: "d", cells: [special("でゅ", "デュ", "dyu")] },
      { rowLabel: "f", cells: [special("ふゅ", "フュ", "fyu")] },
    ],
  },
  // 작은 ヵ・ヶ는 요음이 아니라 조수사 등에 쓰는 약자다(一ヶ月 いっかげつ, 三ヵ所 さんかしょ).
  // 히라가나 키 ゕ・ゖ는 유니코드에 있지만 폰트가 거의 없어서 화면에는 절대 쓰지 않는다.
  {
    id: "small-ka-ke",
    tab: "special",
    label: "작은 ヵ・ヶ",
    columnHeaders: ["ka", "ke"],
    rows: [
      {
        rowLabel: "",
        cells: [
          special("ゕ", "ヵ", "ka", {
            speech: "か",
            note: "三ヵ所(さんかしょ)처럼 개수를 셀 때 쓰는 작은 カ예요. か(또는 が)로 읽어요.",
          }),
          special("ゖ", "ヶ", "ke", {
            speech: "か",
            note: "一ヶ月(いっかげつ)처럼 개수를 셀 때 쓰는 작은 ケ예요. 모양은 ケ지만 か(또는 が)로 읽어요.",
          }),
        ],
      },
    ],
  },
];
