import { useCallback, useEffect, useRef } from "react";

/**
 * macOS(Ventura+)가 기본으로 깔아두는 "캐릭터" 목소리들. ja-JP 목록의 맨 앞을 차지하는데
 * (예전 코드가 목록 첫 번째를 골라서 Eddy가 쓰이고 있었다) 과장된 연기 톤이라 발음 학습에는
 * 부적합하다. 이름만으로 거르므로 소문자로 비교한다.
 */
const NOVELTY_VOICES = [
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
  "bells",
  "boing",
  "bubbles",
  "jester",
  "organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "bad news",
  "good news",
  "cellos",
  "bahh",
];

/** 플랫폼별 "제대로 된" 일본어 음성 이름. 뒤로 갈수록 우선순위가 낮다. */
const PREFERRED_VOICES = [
  "o-ren", // macOS Siri 음성(가장 자연스럽다)
  "hattori", // macOS Siri 음성
  "google 日本語", // Chrome 기본 일본어 음성
  "kyoko", // macOS 표준 일본어 음성
  "otoya",
  "nanami", // Windows/Edge
  "ayumi",
  "haruka",
  "ichiro",
  "keita",
  "sayaka",
];

/** 이름에 붙어 있으면 같은 화자의 고품질(추가 다운로드) 버전이라는 표시. */
const QUALITY_HINTS = ["premium", "enhanced", "neural", "natural", "siri"];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();

  if (NOVELTY_VOICES.some((n) => name.startsWith(n))) return -100;

  let score = 0;
  const preferredIndex = PREFERRED_VOICES.findIndex((n) => name.includes(n));
  if (preferredIndex >= 0) score += 50 - preferredIndex;
  if (QUALITY_HINTS.some((hint) => name.includes(hint))) score += 20;
  if (voice.lang === "ja-JP") score += 2;
  if (voice.default) score += 1;
  return score;
}

/**
 * 설치된 일본어 음성 중 가장 자연스러운 것을 고른다. 기기마다 목록도 순서도 달라서
 * "첫 번째"를 그냥 쓰면 안 된다 — macOS에서는 캐릭터 목소리(Eddy)가 첫 번째로 온다.
 */
function pickJapaneseVoice(voices: SpeechSynthesisVoice[]) {
  const japanese = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
  if (japanese.length === 0) return null;

  return japanese.reduce((best, voice) => (scoreVoice(voice) > scoreVoice(best) ? voice : best));
}

/**
 * 긴 문장을 문장부호 단위로 끊는다. Chrome에는 긴 발화가 15초쯤에서 잘려버리는 버그가 있는데,
 * 문장 단위로 나눠 큐에 넣으면 그 버그를 피하면서 문장 사이 호흡도 자연스러워진다.
 */
function splitForSpeech(text: string): string[] {
  const sentences = text.match(/[^。．.！!？?\n]+[。．.！!？?]*\s*/g) ?? [text];
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const last = chunks[chunks.length - 1];
    // 너무 잘게 쪼개면 오히려 뚝뚝 끊겨 들려서, 짧은 문장은 앞 조각에 붙인다.
    if (last && last.length + piece.length <= 120) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }

  return chunks.length > 0 ? chunks : [text];
}

interface SpeakOptions {
  /** 1이 기본 속도. 기본값 0.95 — 1.0은 학습자가 따라가기 빠르고, 0.85는 늘어져 부자연스럽다. */
  rate?: number;
}

/** Web Speech API(SpeechSynthesis)로 일본어 문자를 읽어주는 훅. */
export function useJapaneseSpeech() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;

    const loadVoice = () => {
      voiceRef.current = pickJapaneseVoice(window.speechSynthesis.getVoices());
    };
    loadVoice();
    // 일부 브라우저는 getVoices()가 비동기로 채워져 voiceschanged 이벤트가 필요하다
    window.speechSynthesis.addEventListener("voiceschanged", loadVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoice);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, { rate = 0.95 }: SpeakOptions = {}) => {
      if (!isSupported) return;
      window.speechSynthesis.cancel(); // 이전 발화가 남아있으면 끊고 새로 재생

      for (const chunk of splitForSpeech(text)) {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = "ja-JP";
        utterance.rate = rate;
        utterance.pitch = 1;
        if (voiceRef.current) utterance.voice = voiceRef.current;
        window.speechSynthesis.speak(utterance); // 여러 개를 넣으면 큐에 쌓여 순서대로 읽힌다
      }
    },
    [isSupported]
  );

  return { speak, isSupported };
}
