import { useCallback, useEffect, useRef, useState } from "react";
import { pickJapaneseVoice, pickSpeakerVoices, splitForSpeech } from "../lib/japaneseVoices";

// 어떤 음성을 고를지(캐릭터 목소리 거르기·선호 순서·A/B 화자)는 lib/japaneseVoices.ts에 있다.

interface SpeakOptions {
  /** 1이 기본 속도. 기본값 0.95 — 1.0은 학습자가 따라가기 빠르고, 0.85는 늘어져 부자연스럽다. */
  rate?: number;
}

export type SpeechLine = { speaker?: "A" | "B"; text: string };

interface SpeakLinesOptions {
  rate: number;
  /** 화자가 바뀔 때 쉬는 시간(ms). 같은 화자가 이어 말할 때는 짧게 쉰다. */
  pauseMs?: number;
  /** 몇 번째 줄을 읽기 시작했는지 — 화면에서 지금 누가 말하는지 보여줄 때 */
  onLine?: (index: number) => void;
  /** 끝까지 다 읽었을 때. 중간에 멈추면(stop·다른 발화) 불리지 않는다. */
  onEnd?: () => void;
}

const SAME_SPEAKER_PAUSE_MS = 250;

/** Web Speech API(SpeechSynthesis)로 일본어 문자를 읽어주는 훅. */
export function useJapaneseSpeech() {
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  /** 진행 중인 `speakLines`의 번호 — 멈추거나 새로 읽으면 올려서 늦게 오는 onend를 버린다. */
  const sequenceRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    // 일부 브라우저는 getVoices()가 비동기로 채워져 voiceschanged 이벤트가 필요하다
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [isSupported]);

  const stop = useCallback(() => {
    sequenceRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (isSupported) window.speechSynthesis.cancel();
  }, [isSupported]);

  const speak = useCallback(
    (text: string, { rate = 0.95 }: SpeakOptions = {}) => {
      if (!isSupported) return;
      stop(); // 이전 발화가 남아있으면 끊고 새로 재생

      const voice = pickJapaneseVoice(voicesRef.current);
      for (const chunk of splitForSpeech(text)) {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = "ja-JP";
        utterance.rate = rate;
        utterance.pitch = 1;
        if (voice) utterance.voice = voice;
        window.speechSynthesis.speak(utterance); // 여러 개를 넣으면 큐에 쌓여 순서대로 읽힌다
      }
    },
    [isSupported, stop]
  );

  /**
   * 대사 여러 줄을 차례로 읽는다(청해). A/B 화자는 다른 목소리로(없으면 B만 음높이를 올려서),
   * 화자가 바뀔 때는 잠깐 쉰다. **한 줄씩 onend를 기다려 다음 줄을 넣는다** — 큐에 한꺼번에 넣으면
   * 줄 사이에 쉴 방법도, 지금 몇 번째 줄인지 알 방법도 없다.
   */
  const speakLines = useCallback(
    (lines: SpeechLine[], { rate, pauseMs = 600, onLine, onEnd }: SpeakLinesOptions) => {
      if (!isSupported || lines.length === 0) return;
      stop();
      const sequence = sequenceRef.current;
      const speakers = pickSpeakerVoices(voicesRef.current);

      const playLine = (index: number) => {
        if (sequence !== sequenceRef.current) return;
        if (index >= lines.length) {
          onEnd?.();
          return;
        }
        const line = lines[index];
        const role = speakers?.[line.speaker ?? "A"];
        onLine?.(index);
        const chunks = splitForSpeech(line.text);
        chunks.forEach((chunk, i) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = "ja-JP";
          utterance.rate = rate;
          utterance.pitch = role?.pitch ?? 1;
          if (role) utterance.voice = role.voice;
          if (i === chunks.length - 1) {
            const nextLine = lines[index + 1];
            const changes = !!nextLine && (nextLine.speaker ?? "A") !== (line.speaker ?? "A");
            utterance.onend = () => {
              if (sequence !== sequenceRef.current) return;
              timerRef.current = window.setTimeout(
                () => playLine(index + 1),
                changes ? pauseMs : SAME_SPEAKER_PAUSE_MS
              );
            };
          }
          window.speechSynthesis.speak(utterance);
        });
      };
      playLine(0);
    },
    [isSupported, stop]
  );

  return { speak, speakLines, stop, isSupported };
}

/** 일본어 음성이 있는가 — "checking" 동안은 단정하지 말 것. */
export type JapaneseVoiceStatus = "checking" | "available" | "unavailable";

/** 목록이 비어 있어도 이만큼은 voiceschanged를 기다린다(Chrome은 처음엔 빈 목록을 준다). */
const VOICE_WAIT_MS = 1500;

/**
 * 이 브라우저에 일본어 음성이 있는지. 레벨 진단이 **청해를 낼지** 정하는 데 쓴다 — 음성이 없으면
 * 청해를 건너뛰고 "측정 안 함"으로 둔다(0점으로 치지 않는다).
 * Chrome은 `getVoices()`가 처음에 빈 배열이고 `voiceschanged`로 채워진다. 그래서 바로 "없음"으로
 * 정하지 않고 잠깐 기다린다.
 */
export function useJapaneseVoiceStatus(): JapaneseVoiceStatus {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [status, setStatus] = useState<JapaneseVoiceStatus>(isSupported ? "checking" : "unavailable");

  useEffect(() => {
    if (!isSupported) return;
    const check = () => {
      if (pickSpeakerVoices(window.speechSynthesis.getVoices())) {
        setStatus("available");
        return true;
      }
      return false;
    };
    if (check()) return;
    const onChange = () => void check();
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    const timer = window.setTimeout(() => {
      if (!check()) setStatus("unavailable");
    }, VOICE_WAIT_MS);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      window.clearTimeout(timer);
    };
  }, [isSupported]);

  return status;
}
