/**
 * 새로 만든 AI 세션에 **앞선 대화를 다시 채워 넣는** 데 쓰는 순수 함수들.
 *
 * 모델이 앞 대화를 아는 방법은 메모리에 있는 세션 하나뿐이고, 화면의 대화는 IndexedDB에서 따로
 * 읽는다. 그래서 세션이 새로 만들어지면(새로고침, 기억 스냅샷 갱신으로 시스템 프롬프트가 바뀜,
 * 모바일 GPU 유실, 유출 가드의 reset) **화면에는 대화가 그대로 있는데 모델은 처음부터** 시작했다 —
 * 「부정형 문장으로 바꾸면?」을 앞 문장 없이 받아 그 한국어 질문 자체를 문장 분석했다(실제로 겪었다).
 *
 * 어느 세션이든 새로 만들 때 저장된 대화에서 맥락을 다시 채우면 화면과 모델이 같은 대화를 본다.
 */

/** 세션에 미리 넣는 한 턴. 두 엔진 모두 이 모양을 받는다(Prompt API `initialPrompts`, Gemma `preface`). */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** 메시지 하나에 붙는 역할 표시·구분 토큰 몫. */
const PER_MESSAGE_OVERHEAD = 8;

/**
 * 토큰 수 어림. 두 엔진 다 세션을 만들기 **전에** 정확한 토크나이저를 쓸 방법이 없다.
 *
 * **넉넉하게(많게) 센다** — 적게 세면 컨텍스트 창을 넘겨 세션 생성이 실패하거나(Prompt API의
 * QuotaExceededError) 답변 도중 잘린다. 한글·가나·한자는 글자당 1토큰, 나머지(영문·숫자·기호·
 * 공백)는 3글자당 1토큰으로 본다. 실제로는 이보다 조금 적게 쓴다.
 */
export function estimateTokens(text: string): number {
  let wide = 0;
  let narrow = 0;
  for (const ch of text) {
    if (ch.codePointAt(0)! > 0x7f) wide++;
    else narrow++;
  }
  return wide + Math.ceil(narrow / 3);
}

export function estimateTurnTokens(turn: ChatTurn): number {
  return estimateTokens(turn.content) + PER_MESSAGE_OVERHEAD;
}

/**
 * 답변 몫으로 비워 두는 토큰. 선생님의 긴 문법 설명이 1천 자를 조금 넘는다. 이걸 너무 작게 잡으면
 * 앞선 대화로 창을 꽉 채운 세션에서 **답변이 중간에 잘린다.**
 */
export const OUTPUT_RESERVE_TOKENS = 1536;

/**
 * 컨텍스트 창에서 시스템 지시·지금 보낼 질문·답변 몫을 빼고 남는 자리 — 앞선 대화에 쓸 수 있는 몫.
 */
export function historyBudget(contextWindow: number, systemPrompt: string, input: string): number {
  const fixed =
    estimateTokens(systemPrompt) + PER_MESSAGE_OVERHEAD + estimateTokens(input) + PER_MESSAGE_OVERHEAD;
  return Math.max(0, contextWindow - fixed - OUTPUT_RESERVE_TOKENS);
}

/**
 * 살아 있는 세션에 이 질문을 더 보내면 창이 넘치는가. 넘치면 세션을 새로 만들고 앞선 대화를
 * 예산만큼만 다시 채운다(오래된 쪽이 빠진다). `used`는 엔진이 센 실제 토큰 수다.
 */
export function wouldOverflow(used: number, input: string, contextWindow: number): boolean {
  return used + estimateTokens(input) + PER_MESSAGE_OVERHEAD + OUTPUT_RESERVE_TOKENS > contextWindow;
}

/**
 * 예산(토큰) 안에 들어가는 만큼 **최근 턴부터** 고른다. 질문·답변은 **한 쌍씩** 넣는다 — 답만
 * 남거나 질문만 남으면 모델이 짝을 잘못 맞춘다. 순서는 원래 순서 그대로 돌려준다.
 *
 * 들어가지 않는 쌍을 만나면 거기서 멈춘다(그보다 오래된 짧은 쌍을 건너뛰어 끼워 넣지 않는다) —
 * 중간이 빠진 대화는 "그거"·"아까 그 문장"이 엉뚱한 곳을 가리키게 만든다.
 *
 * `turns`는 user → assistant가 번갈아 오는 모양이어야 한다(`teacherHistoryTurns`가 그렇게 만든다).
 * 짝이 안 맞는 꼬리는 버린다.
 */
export function fitHistory(turns: ChatTurn[], budgetTokens: number): ChatTurn[] {
  const picked: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 1; i -= 2) {
    const question = turns[i - 1];
    const answer = turns[i];
    if (question.role !== "user" || answer.role !== "assistant") break;
    const cost = estimateTurnTokens(question) + estimateTurnTokens(answer);
    if (used + cost > budgetTokens) break;
    used += cost;
    picked.unshift(question, answer);
  }
  return picked;
}
