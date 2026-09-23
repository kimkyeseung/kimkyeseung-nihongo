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

/** 인식 이벤트에서 지금까지 들린 후보를 전부(interim 포함, 대안 전부) 꺼낸다. */
export function transcriptsOf(event: SpeechRecognitionEvent): { texts: string[]; isFinal: boolean } {
  const texts: string[] = [];
  let isFinal = false;
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    if (result.isFinal) isFinal = true;
    for (let j = 0; j < result.length; j++) texts.push(result[j].transcript);
  }
  return { texts, isFinal };
}
