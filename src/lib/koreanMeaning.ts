// 한국어 뜻풀이 다루기. 사전 데이터(7.7MB)를 import하지 않는다 — 사전을 동적으로 받는 화면(레벨 진단)도
// 정적으로 쓸 수 있어야 해서 dictionary.ts에서 떼어냈다.

/**
 * 한국어 뜻풀이를 검색에 쓸 토막으로 자른다.
 *
 * `"머리에) 이다, 얹다"`처럼 한 뜻풀이에 여러 말이 쉼표로 묶여 있어서, 통째로 `includes`만
 * 하면 **음절만 겹쳐도 걸린다** — "물"로 검색했을 때 "물러나다"·"결합물"·"물체"가 먼저 나오고
 * 정작 `水`가 안 보였다. 쉼표·세미콜론으로 자르고, 앞에 붙은 괄호 설명(`"(마시는) 물"`)은
 * 떼어낸 형태도 같이 후보로 둔다.
 */
export function koreanTokens(koreanMeaning: string[]): string[] {
  const tokens: string[] = [];
  for (const meaning of koreanMeaning) {
    for (const raw of meaning.split(/[,;]/)) {
      const token = raw.trim();
      if (!token) continue;
      tokens.push(token);
      // "(마시는) 물" → "물", "(겸양어) 먹다" → "먹다"
      const stripped = token.replace(/^\([^)]*\)\s*/, "").trim();
      if (stripped && stripped !== token) tokens.push(stripped);
    }
  }
  return tokens;
}
