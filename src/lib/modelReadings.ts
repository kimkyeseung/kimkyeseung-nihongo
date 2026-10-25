/**
 * 선생님 답변에서 **모델이 직접 쓴 읽기(후리가나)를 걷어낸다.**
 *
 * 읽기는 사전 정보라 모델에게 쓰게 하지 않는다 — 앱이 백틱 속 일본어에 사전 후리가나를 붙인다.
 * 프롬프트에도 "직접 쓰지 마세요"가 있지만 작은 모델은 계속 `面白い` (おもろい)·`教えてください`
 * (しちゃいてください)처럼 **틀린 읽기**를 붙였다(디버그 내보내기로 확인). 화면에는 사전의 맞는
 * 후리가나 옆에 틀린 읽기가 나란히 떠서 학습자가 어느 쪽을 믿어야 할지 모른다. 프롬프트로 못 막는
 * 것은 코드로 막는다(표기 유지·scriptPreference와 같은 교훈).
 *
 * 걷어내는 것은 **괄호 안이 가나뿐인 것**뿐이다. `(물)`처럼 뜻을 적은 괄호, `(와)`처럼 한글로 소리를
 * 적은 괄호는 건드리지 않는다 — 한글 괄호는 뜻인지 소리인지 코드로 가를 수 없다.
 *  - 백틱 바로 뒤: `` `面白い` (おもろい) `` → `` `面白い` ``
 *  - 백틱 안 끝: `` `楽しむ(たのしむ)` `` → `` `楽しむ` ``,
 *    뜻이 같이 있으면 뜻만 밖으로: `` `楽しむ(たのしむ, 즐기다)` `` → `` `楽しむ` (즐기다) ``
 * 백틱 안이 한자 없이 가나뿐이면 읽기가 아니라 같은 말을 되풀이한 것이라 역시 지운다.
 */
const KANA_ONLY = "[\\u3041-\\u3096\\u30a1-\\u30fa\\u30fc・ 　]+";

const READING_AFTER_SPAN = new RegExp(`(\`[^\`\\n]+\`)[ \\t]*[(（]\\s*${KANA_ONLY}\\s*[)）]`, "g");
const READING_INSIDE_SPAN = new RegExp(
  `\`([^\`\\n]*?)\\s*[(（]\\s*${KANA_ONLY}\\s*(?:[,，、]\\s*([^\`)）\\n]*?))?\\s*[)）]\``,
  "g"
);

export function stripModelReadings(text: string): string {
  return text
    .replace(READING_INSIDE_SPAN, (whole, body: string, meaning: string | undefined) => {
      if (!body.trim()) return whole;
      return meaning?.trim() ? `\`${body}\` (${meaning.trim()})` : `\`${body}\``;
    })
    .replace(READING_AFTER_SPAN, "$1");
}
