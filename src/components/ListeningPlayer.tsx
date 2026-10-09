import { useEffect, useState } from "react";
import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { listeningRate } from "../lib/japaneseVoices";
import type { JlptLevel } from "../types/jlpt";
import type { ListeningItem } from "../types/levelTest";

/** 한 문제를 들을 수 있는 횟수 */
const MAX_PLAYS = 2;

/**
 * 레벨 진단의 청해 플레이어. **`SpeakButton`이 아니라 `useJapaneseSpeech`를 직접 쓴다** —
 * 대사가 여러 줄이고, A/B 화자 사이에 쉬어야 하고, 재생 횟수를 세야 해서 문장 하나를 읽는 버튼으로는
 * 안 된다("화면마다 useJapaneseSpeech를 새로 부르지 말 것" 규칙의 예외, CLAUDE.md 참고).
 *
 * - 문제가 떠도 **자동으로 재생하지 않는다** — 모바일은 사용자 동작 없는 재생을 막는다.
 * - 두 번까지 들을 수 있다. 재생 중에도 보기를 고를 수 있다(부르는 쪽이 막지 않는다).
 * - 대사는 화면에 보이지 않는다(결과 화면의 다시 보기에서만).
 * - 다음 문제로 가거나(부르는 쪽이 `key`로 리마운트) 진단을 떠나면 멈춘다 — 안 멈추면 다음 문제
 *   위로 앞 대화가 계속 흘러나온다.
 */
function ListeningPlayer({ item, level }: { item: ListeningItem; level: JlptLevel }) {
  const { speakLines, stop } = useJapaneseSpeech();
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState<number | null>(null);

  useEffect(() => stop, [stop]);

  function play() {
    if (playing || plays >= MAX_PLAYS) return;
    setPlays((n) => n + 1);
    setPlaying(true);
    speakLines(item.script, {
      rate: listeningRate(level),
      onLine: setLine,
      onEnd: () => {
        setPlaying(false);
        setLine(null);
      },
    });
  }

  const left = MAX_PLAYS - plays;
  const speaker = line === null ? null : (item.script[line]?.speaker ?? null);

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-gray-50 p-5">
      <button
        onClick={play}
        disabled={playing || left === 0}
        aria-label={playing ? "듣는 중" : "대화 듣기"}
        className="btn-press flex h-20 w-20 items-center justify-center rounded-full bg-primary text-4xl text-white disabled:opacity-50"
        style={{ ["--btn-shadow" as string]: "#3d9401" }}
      >
        {playing ? "🔊" : "▶"}
      </button>
      <p className="text-sm text-gray-500" aria-live="polite">
        {playing
          ? speaker
            ? `${speaker}가 말하는 중...`
            : "듣는 중..."
          : left === MAX_PLAYS
            ? "▶를 눌러 대화를 들어 보세요"
            : left > 0
              ? `한 번 더 들을 수 있어요`
              : "다 들었어요. 답을 골라 주세요"}
      </p>
      <p className="text-xs text-gray-400">
        {Array.from({ length: MAX_PLAYS }, (_, i) => (i < left ? "●" : "○")).join(" ")}
      </p>
    </div>
  );
}

export default ListeningPlayer;
