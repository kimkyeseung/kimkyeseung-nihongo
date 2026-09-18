// 오십음도(五十音図) 정적 데이터: 청음/탁음/반탁음/요음.
// 사전적 사실(문자/발음 표기)이라 LLM으로 생성하지 않고 직접 정의한다.
export interface KanaCell {
  hiragana: string;
  katakana: string;
  romaji: string;
}

/** 오십음도에서 지금 보고 있는 문자 체계. */
export type ScriptMode = "hiragana" | "katakana";

export interface KanaSection {
  id: string;
  label: string;
  columnHeaders: string[];
  rows: { rowLabel: string; cells: (KanaCell | null)[] }[];
}

const cell = (hiragana: string, katakana: string, romaji: string): KanaCell => ({
  hiragana,
  katakana,
  romaji,
});

export const GOJUON_SECTIONS: KanaSection[] = [
  {
    id: "seion",
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
    label: "반탁음 (半濁音)",
    columnHeaders: ["a", "i", "u", "e", "o"],
    rows: [
      { rowLabel: "p", cells: [cell("ぱ", "パ", "pa"), cell("ぴ", "ピ", "pi"), cell("ぷ", "プ", "pu"), cell("ぺ", "ペ", "pe"), cell("ぽ", "ポ", "po")] },
    ],
  },
  {
    id: "youon",
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
];
