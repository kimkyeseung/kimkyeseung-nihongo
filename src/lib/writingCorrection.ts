export function buildWritingCorrectionPrompt(text: string): string {
  return [
    "당신은 일본어 작문 첨삭 선생님입니다. 학습자가 쓴 아래 일본어 문장을 첨삭하세요.",
    "다른 설명 없이 반드시 아래 형식 그대로 답하세요:",
    "### 수정문",
    "(자연스럽게 고친 일본어 문장 전체. 오류가 없으면 원문과 똑같이 적으세요.)",
    "### 격식체",
    "(반말/정중체/격식체 등 문장의 격식 수준을 한국어로 짧게 판단)",
    "### 설명",
    '(문법 오류나 어색한 표현이 있으면 한국어로 1~3문장 설명. 없으면 "자연스러운 문장입니다."라고만 적으세요.)',
    "",
    `문장: ${text}`,
  ].join("\n");
}

export interface WritingCorrectionResult {
  corrected: string;
  formality: string;
  explanation: string;
}

function extractSection(raw: string, heading: string): string | null {
  const match = raw.match(new RegExp(`###\\s*${heading}\\s*\\n?([\\s\\S]*?)(?=###|$)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/** 모델이 지정한 포맷을 안 따르면(예: 스텁/구형 모델) 원문 그대로 보여주고 전체 응답을 설명으로 폴백한다. */
export function parseCorrectionResponse(raw: string, original: string): WritingCorrectionResult {
  return {
    corrected: extractSection(raw, "수정문") ?? original,
    formality: extractSection(raw, "격식체") ?? "",
    explanation: extractSection(raw, "설명") ?? raw.trim(),
  };
}
