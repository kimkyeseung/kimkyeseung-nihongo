import { useCallback, useEffect, useRef } from "react";

function pickJapaneseVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((v) => v.lang === "ja-JP") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("ja")) ??
    null
  );
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
    (text: string) => {
      if (!isSupported) return;
      window.speechSynthesis.cancel(); // 이전 발화가 남아있으면 끊고 새로 재생
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.rate = 0.85;
      if (voiceRef.current) utterance.voice = voiceRef.current;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported]
  );

  return { speak, isSupported };
}
