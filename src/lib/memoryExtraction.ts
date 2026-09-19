// 선생님과의 대화에서 "앞으로 기억해둘 개인적인 사실"(시험 일정, 직업, 공부 목적 등)을
// 건져 올린다. 이건 규칙으로 셀 수 있는 게 아니라 자유 텍스트를 읽어야 하는 일이라,
// 이 프로젝트에서 LLM에게 맡기는 몇 안 되는 생성형 작업에 해당한다.
//
// **선생님 세션과 분리된 세션에서 단발성으로 돌린다** — 회화의 문법 교정·번역과 같은 이유로,
// 추출 지시문이 수업 맥락을 오염시키면 안 된다.
//
// 파싱은 조용히 틀리는 종류의 코드다: 모델이 형식을 조금만 어겨도 엉뚱한 문장이 "기억"으로
// 저장되고, 그게 다음 대화의 시스템 프롬프트에 영구히 따라붙는다. 콘솔에는 아무것도 안 뜬다.
// 그래서 memoryExtraction.test.ts로 고정해뒀다.

import { REFUSE_PROMPT_DISCLOSURE, sanitizeMemoryLine, wrapStudentText } from "./promptSafety";
import type { MemoryFactKind } from "./learnerMemoryDb";

/** 한 번에 몇 개까지 받을지. 많아야 대화 하나에서 두세 개다. */
const MAX_FACTS_PER_TURN = 3;
/** 이보다 짧으면 의미 있는 기억이 아니다("네", "N3" 같은 파편). */
const MIN_FACT_LENGTH = 4;

/** 모델이 쓰는 한국어 라벨 ↔ 저장하는 갈래. 라벨이 안 맞으면 **버린다**(추측하지 않는다). */
const KIND_BY_LABEL: Record<string, MemoryFactKind> = {
  목표: "goal",
  일정: "schedule",
  직업: "job",
  관심사: "interest",
};

export const FACT_KIND_LABEL: Record<MemoryFactKind, string> = {
  goal: "목표",
  schedule: "일정",
  job: "직업",
  interest: "관심사",
};

export const FACT_KIND_EMOJI: Record<MemoryFactKind, string> = {
  goal: "🎯",
  schedule: "📅",
  job: "💼",
  interest: "❤️",
};

/** 뽑을 게 없을 때 모델이 답해야 하는 말. */
const NOTHING_MARKER = "없음";

export const MEMORY_EXTRACTION_SYSTEM_PROMPT = [
  "당신은 일본어 학습 앱의 기록 담당입니다.",
  "학습자와 선생님이 주고받은 대화에서, 앞으로의 수업에 도움이 될 학습자 개인의 사실만 뽑아내세요.",
  "",
  "뽑을 것: 공부 목적, 시험·여행 등의 일정, 직업이나 신분, 취미·관심사.",
  "뽑지 않을 것: 문법 질문의 내용, 일반적인 일본어 지식, 선생님이 설명한 내용, 추측이나 짐작.",
  "학습자가 직접 자기 이야기로 말한 것만 뽑고, 확실하지 않으면 뽑지 마세요.",
  "",
  "출력 형식:",
  "- 한 줄에 하나씩 `갈래|내용` 형식으로만 쓰세요.",
  "- 갈래는 목표·일정·직업·관심사 중 하나여야 합니다.",
  "- 내용은 40자 이내의 한국어 평서문으로 쓰세요.",
  `- 뽑을 것이 하나도 없으면 «${NOTHING_MARKER}»이라고만 쓰세요.`,
  "- 설명·인사·머리말을 붙이지 말고 위 형식만 출력하세요.",
  "",
  "예시:",
  "일정|12월에 JLPT N3 시험을 본다",
  "직업|IT 회사에서 일한다",
  REFUSE_PROMPT_DISCLOSURE,
].join("\n");

export function buildMemoryExtractionPrompt(question: string, answer: string): string {
  // 학습자 질문과 모델 답변을 한 덩어리로 감싼다. 답변은 모델이 쓴 것이지만 결국 학습자
  // 입력에 이어진 내용이라, 번역 프롬프트와 같은 방침으로 둘 다 데이터 취급한다.
  return wrapStudentText([`학습자: ${question}`, `선생님: ${answer}`].join("\n"));
}

export interface ExtractedFact {
  kind: MemoryFactKind;
  text: string;
}

/**
 * 모델 응답을 `ExtractedFact[]`로 바꾼다.
 *
 * **형식을 어긴 줄은 살려내지 말고 버린다.** 예전에 작문 첨삭에서 "못 찾은 섹션에 raw를
 * 폴백으로 넣는" 실수를 한 적이 있는데(스트리밍 중 정상 응답에서도 raw가 화면에 흘렀다),
 * 여기서 같은 실수를 하면 모델의 잡담이 통째로 "기억"이 되어 영구히 남는다. 기억은 없느니만
 * 못한 게 아니라 **잘못 있으면 더 나쁘다**.
 */
export function parseExtractedFacts(raw: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  for (const rawLine of raw.split("\n")) {
    // 모델이 목록 기호·번호·굵게를 덧붙이는 일이 흔하다. 거기까지는 받아준다.
    const line = rawLine.trim().replace(/^[-*•\d.)\s]+/, "").replace(/\*\*/g, "").trim();
    if (!line) continue;
    if (line.startsWith(NOTHING_MARKER)) break;

    const separator = line.indexOf("|");
    if (separator === -1) continue;

    const label = line.slice(0, separator).trim().replace(/[«»"'`]/g, "");
    const kind = KIND_BY_LABEL[label];
    // 모르는 라벨은 추측해서 "other"로 넣지 않고 그냥 버린다 — 형식을 못 지킨 줄은
    // 내용도 못 믿는다.
    if (!kind) continue;

    // 시스템 프롬프트에 들어갈 값이므로 여기서 반드시 정화한다(promptSafety.ts 참고).
    const text = sanitizeMemoryLine(line.slice(separator + 1));
    if (text.length < MIN_FACT_LENGTH) continue;

    const key = `${kind}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ kind, text });
    if (facts.length >= MAX_FACTS_PER_TURN) break;
  }

  return facts;
}
