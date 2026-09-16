export interface Scenario {
  id: string;
  label: string;
  emoji: string;
  situation: string;
}

export const SCENARIOS: Scenario[] = [
  { id: "cafe", label: "카페 주문", emoji: "☕", situation: "카페 점원과 손님으로서 음료/디저트를 주문하는 상황" },
  { id: "directions", label: "길 묻기", emoji: "🗺️", situation: "낯선 사람에게 길을 묻고 안내를 받는 상황" },
  { id: "intro", label: "자기소개", emoji: "🙋", situation: "처음 만난 사람과 서로 자기소개를 나누는 상황" },
  { id: "free", label: "자유대화", emoji: "💬", situation: "주제 제한 없이 자유롭게 잡담하는 상황" },
];

export interface Level {
  id: string;
  label: string;
  guide: string;
}

export const LEVELS: Level[] = [
  { id: "beginner", label: "초급", guide: "JLPT N5~N4 수준의 쉬운 단어와 짧은 문장" },
  { id: "intermediate", label: "중급", guide: "JLPT N3~N2 수준의 어휘와 자연스러운 구어체" },
  { id: "advanced", label: "고급", guide: "JLPT N1 수준을 포함한 폭넓은 어휘와 관용 표현" },
];

export function buildSystemPrompt(scenario: Scenario, level: Level, userName?: string): string {
  return [
    "당신은 일본어 회화 연습 상대 역할을 맡은 AI입니다.",
    `상황: ${scenario.situation}.`,
    `학습자 수준: ${level.guide}. 이 수준에 맞는 어휘와 문장 길이를 사용하세요.`,
    ...(userName
      ? [`학습자의 이름은 "${userName}"입니다. 자기소개처럼 이름이 자연스럽게 필요한 상황에서만 이름을 사용하세요.`]
      : []),
    "반드시 일본어로만 응답하고, 매 응답은 2~3문장 이내로 짧게 답하세요.",
    "한국어를 섞지 말고, 상황에 자연스러운 구어체로 대화를 이어가세요.",
  ].join(" ");
}

export function buildCorrectionPrompt(userInput: string): string {
  return [
    "당신은 일본어 문법 교정 도우미입니다.",
    "아래 학습자가 쓴 일본어 문장에 문법 오류나 어색한 표현이 있으면 한국어로 짧게(1~2문장) 짚어주고,",
    "특별한 문제가 없으면 '문법적으로 자연스러운 문장입니다.'라고만 답하세요.",
    "다른 설명 없이 교정 포인트만 답하세요.",
    "",
    `문장: ${userInput}`,
  ].join("\n");
}
