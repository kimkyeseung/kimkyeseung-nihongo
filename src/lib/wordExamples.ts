import { JLPT_LEVELS } from "../types/jlpt";
import type { WordEntry } from "../types/dictionary";
import { REFUSE_PROMPT_DISCLOSURE, wrapStudentText } from "./promptSafety";

const EXAMPLE_COUNT = 3;

export type ExampleDifficulty = "easier" | "harder";

/** 모델이 만들어 돌려준 예문 한 쌍 — 아직 화면에 자리를 잡기 전의 날것. */
export interface ParsedExample {
  japanese: string;
  korean: string;
}

/** 화면과 스토어에 놓인 예문. */
export interface WordExample extends ParsedExample {
  id: string;
  /** 어느 뜻(`entry.senses`의 인덱스)으로 만든 예문인지 — 뜻별로 나눠 보여주는 근거다. */
  senseIndex: number;
  /**
   * 다른 예문을 바꿔 만든 것이면 그 방향. 없으면 뜻에서 바로 만든 예문이다.
   * 화면의 칩 라벨도 이 값으로 그리므로, 쉬운 예문과 어려운 예문이 섞여 쌓여도 구분된다.
   */
  variantOf?: ExampleDifficulty;
}

/**
 * 단어의 JLPT 급수를 기준으로 한 단계 쉽게/어렵게 이동한 급수(양 끝은 고정).
 *
 * **부호를 조심할 것 (실제로 뒤집혀 있었다).** `JLPT_LEVELS`는 `["N5", ..., "N1"]`,
 * 즉 **쉬운 쪽이 앞**이라 쉽게 가려면 인덱스를 빼야 한다. 예전에는 `easier`에 +1을 줘서
 * "더 쉬운 예문"이 오히려 한 급수 위의 어휘를 요구하고 있었다 — 프롬프트에 숫자로만 들어가는
 * 값이라 콘솔에는 아무것도 안 찍히고, 결과가 어려워져도 "모델이 말을 안 듣나 보다" 싶을 뿐이다.
 */
function shiftJlptLevel(level: WordEntry["jlptLevel"], direction: ExampleDifficulty) {
  const idx = JLPT_LEVELS.indexOf(level);
  const delta = direction === "easier" ? -1 : 1;
  const next = Math.min(JLPT_LEVELS.length - 1, Math.max(0, idx + delta));
  return JLPT_LEVELS[next];
}

/** `parseExampleResponse`가 읽을 수 있는 형식을 지시하는 부분(두 프롬프트가 공유한다). */
function formatInstruction(count: number): string[] {
  return [
    "다른 설명 없이 반드시 아래 형식으로만 답하세요:",
    "### 예문",
    "(일본어 문장 전체)",
    "### 번역",
    "(그 문장의 한국어 번역)",
    "",
    count === 1
      ? '이 "### 예문"/"### 번역" 쌍을 한 번만 쓰세요.'
      : `이 "### 예문"/"### 번역" 쌍을 정확히 ${count}번 반복하세요.`,
  ];
}

/**
 * 한 단어의 **특정 뜻**으로 예문을 만드는 프롬프트.
 *
 * 뜻을 골라 넘기는 이유: 표제어 하나에 뜻이 여러 개인 경우가 흔한데(かける처럼 열 개가 넘기도
 * 한다), 단어만 주면 모델이 그중 아무 뜻이나 집는다. 학습자가 방금 읽은 뜻을 확인하려고 눌렀는데
 * 엉뚱한 뜻의 예문이 나오면 누른 의미가 없어진다. 그래서 화면도 뜻마다 버튼을 따로 둔다.
 *
 * **뜻 하나만 넘기는 것으로는 부족했다 (실제로 겪었다).** 座る의 뜻 2("to assume a position")로
 * 만든 예문 3개 중 2개가 뜻 1("앉다")이었고, 나머지 하나는 자동사에 목적어를 붙인 비문이었다.
 * 그래서 **안 되는 뜻과 자/타동사까지** 같이 넘긴다 — 둘 다 사전에 이미 있는 사실이다.
 */
export function buildExamplePrompt(entry: WordEntry, senseIndex: number): string {
  const sense = entry.senses[senseIndex];
  // 나머지 뜻은 **첫 gloss 하나씩만** 뽑아 짧게 둔다 — 뜻이 열 개가 넘는 표제어도 있어서
  // 통째로 넣으면 정작 지켜야 할 ✅ 줄이 긴 목록에 파묻힌다.
  const otherSenses = entry.senses
    .filter((_, i) => i !== senseIndex)
    .map((s) => s.glosses[0])
    .filter((gloss): gloss is string => Boolean(gloss))
    .slice(0, 6);

  return [
    "당신은 일본어 학습자를 위한 예문 작성 선생님입니다.",
    `단어: ${entry.word}(${entry.reading})`,
    `✅ 이 뜻으로만 예문을 만드세요: ${sense.glosses.join("; ")}`,
    // **안 되는 뜻을 직접 보여준다.** "다른 뜻도 있지만 위 뜻만"이라고만 쓰면 모델은 자기가
    // 아는 가장 흔한 뜻으로 돌아간다(座る의 "앉다" → 뜻 2로 고른 예문 3개가 전부 뜻 1이었다).
    otherSenses.length > 0 ? `❌ 이 뜻으로는 만들지 마세요: ${otherSenses.join(" / ")}` : null,
    otherSenses.length > 0
      ? "✅ 뜻이 이 단어의 가장 흔한 뜻이 아니더라도 반드시 ✅ 뜻으로 쓰인 예문만 만드세요. ❌ 뜻의 예문은 한 개도 넣지 마세요."
      : null,
    // 자/타동사는 **사전이 알려주는 사실**이라 코드가 넘긴다. 안 넘겼더니 자동사인 座る에
    // 목적어를 붙여 「その役を座っています」라는 비문을 내놨다(올바른 형태는 「役に座る」).
    sense.pos.includes("vi")
      ? `${entry.word}는 자동사입니다. 목적어에 「を」를 붙이지 마세요(「〜に${entry.word}」처럼 씁니다).`
      : null,
    `자연스러운 일본어 예문을 ${EXAMPLE_COUNT}개, ${entry.jlptLevel} 학습자 난이도로 만드세요.`,
    ...formatInstruction(EXAMPLE_COUNT),
    REFUSE_PROMPT_DISCLOSURE,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * 이미 만든 예문 하나를 **내용은 그대로 두고 문장 구성만** 쉽게/어렵게 바꾸는 프롬프트.
 *
 * 예전에는 난이도 버튼이 목록 전체에 하나씩만 있어서, "더 어려운 예문"을 누르면 앞의 예문과
 * 아무 상관 없는 새 문장 세 개가 또 쌓였다. 배우는 지점은 **같은 내용이 어떻게 복잡해지는가**라
 * (「りんごを食べました」 → 「昨日友達と一緒においしいりんごを食べながら遊びました」)
 * 지금은 버튼이 예문마다 붙고 원문을 프롬프트에 함께 넣는다.
 */
export function buildRewritePrompt(
  entry: WordEntry,
  source: ParsedExample,
  direction: ExampleDifficulty
): string {
  const level = shiftJlptLevel(entry.jlptLevel, direction);
  return [
    "당신은 일본어 학습자를 위한 예문 작성 선생님입니다.",
    direction === "easier"
      ? `아래 문장을 더 쉽게(${level} 수준 어휘, 짧고 기초적인 문형) 다시 쓴 문장 하나를 만드세요.`
      : `아래 문장을 더 어렵게(${level} 수준 어휘, 복잡한 문형이나 관용 표현) 다시 쓴 문장 하나를 만드세요.`,
    "규칙:",
    "- 원래 문장이 말하는 내용(누가 무엇을 어떻게 했는지)은 그대로 유지하세요. 전혀 다른 내용의 새 문장을 만들면 안 됩니다.",
    direction === "easier"
      ? "- 긴 절을 끊고 쉬운 말로 바꿔서 문장 구성을 단순하게 만드세요."
      : "- 시간·장소·함께한 사람 같은 세부 묘사를 덧붙이거나 절을 이어 붙여 문장 구성을 복잡하게 만드세요.",
    `- ${entry.word}는 반드시 그대로 쓰세요.`,
    // 원문은 모델이 만든 문장이지만, 프롬프트에 문장을 끼워 넣는 자리는 전부 데이터로 표시해 둔다.
    wrapStudentText(source.japanese),
    ...formatInstruction(1),
    REFUSE_PROMPT_DISCLOSURE,
  ].join("\n");
}

/**
 * 모델이 강조하려고 붙인 마크다운 기호를 떼어낸다.
 *
 * **예문은 마크다운으로 렌더링되지 않는다** — `ClickableSentence`가 글자 단위로 사전과
 * 대조해 후리가나를 입히는 자리라 원문 그대로 화면에 나간다. 그래서 모델이
 * 「**氏名**を記入」처럼 쓰면 별표가 그대로 보이고(실제로 그랬다), 게다가 단어 분절에서도
 * `**氏名**`가 한 덩어리로 잡혀 氏名을 눌러도 아무 일이 없다. 발음 버튼에 넘어가면
 * TTS가 별표를 읽으려 들기도 한다.
 */
function stripEmphasis(text: string): string {
  return text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").replace(/[*_`]/g, "");
}

/** 모델이 지정한 포맷을 안 따르면(예: 스텁/구형 모델) 안 깨지도록, 매치 실패 시 전체 응답을 예문 하나로 폴백한다. */
export function parseExampleResponse(raw: string): ParsedExample[] {
  const blocks = raw.split(/###\s*예문/).slice(1);
  const examples: ParsedExample[] = [];
  for (const block of blocks) {
    const translationMatch = block.match(/###\s*번역\s*\n?([\s\S]*?)(?=###|$)/);
    const japanese = stripEmphasis(
      (translationMatch ? block.slice(0, translationMatch.index) : block).trim()
    ).trim();
    const korean = stripEmphasis(translationMatch?.[1]?.trim() ?? "").trim();
    if (japanese) examples.push({ japanese, korean });
  }
  if (examples.length === 0 && raw.trim()) {
    examples.push({ japanese: stripEmphasis(raw.trim()).trim(), korean: "" });
  }
  return examples;
}
