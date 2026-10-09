/**
 * 브라우저 음성 인식(Web Speech API의 SpeechRecognition) 창구. 오십음도 발음 게임만 쓴다.
 *
 * TS 기본 타입(lib.dom)에는 이벤트 타입만 있고 `SpeechRecognition` 자체가 없다 — 표준화가
 * 덜 됐고 Chrome은 아직 `webkitSpeechRecognition`이라는 접두사 이름으로만 준다(Safari는 둘 다).
 * 그래서 이 앱이 실제로 쓰는 만큼만 여기 선언한다(`src/types/opfs.ts`의 move()와 같은 사정).
 *
 * **Firefox에는 없다.** 그리고 Chrome의 인식은 기기에서 돌지 않고 **음성을 구글 서버로 보낸다** —
 * 이 앱에서 서버로 무언가를 보내는 유일한 기능이라 게임 화면에 그 사실을 적어 둔다.
 * 네트워크가 없으면 `"network"` 오류가 난다.
 */
export interface KanaSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onaudiostart: ((ev: Event) => void) | null;
  onspeechstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
}

type RecognitionConstructor = new () => KanaSpeechRecognition;

/** 쓸 수 있는 생성자. 없으면 null — 이 브라우저에서는 게임을 할 수 없다. */
export function getSpeechRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** `transcriptsOf`가 읽는 만큼만 — 테스트에서 가짜 이벤트를 만들 수 있게. */
export type RecognitionResultsLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

/**
 * 인식 이벤트에서 지금까지 들린 후보를 전부(interim 포함, 대안 전부) 꺼낸다.
 *
 * **빈 글자는 후보가 아니다 (실제 마이크로 겪었다).** 인식기는 목소리는 잡았는데 받아 적지 못하면
 * `transcript: ""`인 최종 결과를 보낸다. 그걸 후보로 두면 "무언가 들렸는데 틀렸다"가 되어 화면에
 * 「」로 들렸어요 → ❌ 아쉬워요가 떴다. 그래서 빼고, 이런 결과였는지는 `isFinal`과 빈 `texts`로 안다.
 */
export function transcriptsOf(event: RecognitionResultsLike): { texts: string[]; isFinal: boolean } {
  const texts: string[] = [];
  let isFinal = false;
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    if (result.isFinal) isFinal = true;
    for (let j = 0; j < result.length; j++) {
      const text = result[j].transcript;
      if (text.trim()) texts.push(text);
    }
  }
  return { texts, isFinal };
}

/** 디버그 모드에서 남기는 인식 이벤트 한 줄 — 실제 인식기가 무엇을 보냈는지 그대로 본다. */
export function describeRecognitionEvent(event: RecognitionResultsLike): string {
  const parts: string[] = [];
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const alts: string[] = [];
    for (let j = 0; j < result.length; j++) {
      const alt = result[j] as { transcript: string; confidence?: number };
      alts.push(`${JSON.stringify(alt.transcript)}${alt.confidence != null ? `(${alt.confidence.toFixed(2)})` : ""}`);
    }
    parts.push(`${result.isFinal ? "final" : "interim"} [${alts.join(", ")}]`);
  }
  return parts.join(" · ") || "(결과 없음)";
}
