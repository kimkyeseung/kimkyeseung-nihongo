const HANGUL = /[㄰-㆏가-힣]/;

/**
 * TTS(ja-JP 음성)에 넘기기 전에 일본어가 아닌 군더더기를 걷어낸다.
 * 화면에 보이는 문자열을 그대로 읽히면 "うみへ行きます (바다에 갑니다)"처럼 괄호 안 한국어
 * 번역까지 일본어 음성으로 읽어버려서(엉뚱한 발음) 학습에 방해가 된다.
 * 목록 항목 앞의 불릿(-, •)도 함께 떼어낸다.
 */
export function toSpeechText(text: string): string {
  return text
    .replace(/[(（][^()（）]*[)）]/g, (paren) => (HANGUL.test(paren) ? "" : paren))
    .replace(/^\s*[-•*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
