export interface WritingCorrectionOptions {
  keepKanaChoice?: boolean;
  showSimilarSentences?: boolean;
  showAppliedExpressions?: boolean;
  showMorePolite?: boolean;
  showMoreCasual?: boolean;
}

export function buildWritingCorrectionPrompt(
  text: string,
  options: WritingCorrectionOptions = {}
): string {
  const {
    keepKanaChoice = false,
    showSimilarSentences = false,
    showAppliedExpressions = false,
    showMorePolite = false,
    showMoreCasual = false,
  } = options;

  return [
    "당신은 일본어 작문 첨삭 선생님입니다. 학습자가 쓴 아래 일본어 문장을 첨삭하세요.",
    "다른 설명 없이 반드시 아래 형식 그대로 답하세요:",
    "### 수정문",
    "(자연스럽게 고친 일본어 문장 전체. 오류가 없으면 원문과 똑같이 적으세요.)",
    "### 격식체",
    "(반말/정중체/격식체 등 문장의 격식 수준을 한국어로 짧게 판단)",
    "### 설명",
    '(문법 오류나 어색한 표현이 있으면 한국어로 1~3문장 설명. 없으면 "자연스러운 문장입니다."라고만 적으세요.)',
    "### 문법 포인트",
    "(오류 여부와 상관없이 항상 채우세요. 수정문에 쓰인 핵심 문법/표현을 2~4개 골라, 각각 새 줄에",
    '"- 표현(읽는 법) — 문법 이름: 짧은 설명" 형식의 한국어로 적으세요.',
    "조사, 활용형, 문형, 관용 표현 등 학습자에게 도움이 될 만한 포인트를 우선하세요.)",
    ...(showSimilarSentences
      ? [
          "### 비슷한 문장",
          '(수정문과 비슷한 상황/문형을 쓰는 예문을 2~3개, 각각 새 줄에 "일본어 문장 (한국어 번역)" 형식으로 적으세요.)',
        ]
      : []),
    ...(showAppliedExpressions
      ? [
          "### 응용 표현",
          '(수정문의 핵심 문형은 유지하되 다른 단어/상황으로 바꿔 응용한 표현을 2~3개, 각각 새 줄에 "일본어 표현 (한국어 번역)" 형식으로 적으세요.)',
        ]
      : []),
    ...(showMorePolite
      ? [
          "### 더 정중한 표현",
          '(수정문을 더 격식있고 정중한 버전 한 문장으로 바꿔 적으세요. 이미 가장 정중한 수준이면 "이미 가장 정중한 표현입니다."라고 적으세요.)',
        ]
      : []),
    ...(showMoreCasual
      ? [
          "### 더 친근한 표현",
          "(수정문을 친구 사이에 쓰는 편한 반말/구어체 버전 한 문장으로 바꿔 적으세요.)",
        ]
      : []),
    ...(keepKanaChoice
      ? [
          "",
          "학습자가 히라가나로 쓴 단어를 한자로 바꾸는 등, 문법과 무관하게 한자/가나 표기만 바꾸는 제안은 하지 마세요.",
          "실제 문법 오류나 부자연스러운 표현이 아니라면 학습자가 선택한 한자/가나 표기를 그대로 유지하세요.",
        ]
      : []),
    "",
    `문장: ${text}`,
  ].join("\n");
}

export interface WritingCorrectionResult {
  corrected: string;
  formality: string;
  explanation: string;
  grammarPoints: string[];
  similarSentences: string[];
  appliedExpressions: string[];
  morePolite: string | null;
  moreCasual: string | null;
}

function extractSection(raw: string, heading: string): string | null {
  const match = raw.match(new RegExp(`###\s*${heading}\s*\n?([\s\S]*?)(?=###|$)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/** "- 항목" 형식의 각 줄을 리스트로 뽑는다. 모델이 불릿을 안 붙여도 줄 단위로 폴백한다. */
function extractLines(raw: string, heading: string): string[] {
  const section = extractSection(raw, heading);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

/** 모델이 지정한 포맷을 안 따르면(예: 스텁/구형 모델) 원문 그대로 보여주고 전체 응답을 설명으로 폴백한다. */
export function parseCorrectionResponse(raw: string, original: string): WritingCorrectionResult {
  return {
    corrected: extractSection(raw, "수정문") ?? original,
    formality: extractSection(raw, "격식체") ?? "",
    explanation: extractSection(raw, "설명") ?? raw.trim(),
    grammarPoints: extractLines(raw, "문법 포인트"),
    similarSentences: extractLines(raw, "비슷한 문장"),
    appliedExpressions: extractLines(raw, "응용 표현"),
    morePolite: extractSection(raw, "더 정중한 표현"),
    moreCasual: extractSection(raw, "더 친근한 표현"),
  };
}
