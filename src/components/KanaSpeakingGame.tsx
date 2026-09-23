import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SpeakButton from "./SpeakButton";
import { matchesKana, pickRounds } from "../lib/kanaPronunciation";
import { getSpeechRecognition, transcriptsOf, type KanaSpeechRecognition } from "../lib/speechRecognition";
import { XP_REWARDS } from "../lib/xpRewards";
import { useConfettiStore } from "../stores/confettiStore";
import { useGamificationStore } from "../stores/gamificationStore";
import { recordStudyEvent, useLearnerMemoryStore } from "../stores/learnerMemoryStore";
import type { KanaCell, ScriptMode } from "../data/gojuon";

/**
 * 오십음도 "2초 발음 게임". 글자가 뜨면 2초 안에 소리 내 읽는다 — 마이크로 듣고
 * 브라우저 음성 인식(Web Speech API)으로 채점한다. 채점 규칙은 `kanaPronunciation.ts`.
 *
 * **2초는 "말하기 시작"까지다.** 인식 결과는 말이 끝나고도 수백 ms 뒤에 오고(Chrome은 서버를
 * 한 번 다녀온다) 그 지연은 학습자 탓이 아니다. 그래서 2초 안에 목소리가 잡혔으면 결과를
 * `GRACE_MS`만큼 더 기다린다. 시계도 `start()`가 아니라 마이크가 실제로 열린 순간
 * (`audiostart`)부터 잰다 — 첫 판에는 권한 창이 떠 있는 동안 시간이 흐르면 안 된다.
 */
const LIMIT_MS = 2000;
const GRACE_MS = 1500;
/** 맞힌 뒤 다음 글자로 넘어가기까지. 틀렸을 때는 정답을 들어볼 수 있게 직접 넘긴다. */
const ADVANCE_MS = 900;

// 1.5KB짜리 동음어 표. 게임을 열 때만 받는다(오십음도 청크에 얹지 않으려고).
let homophonesPromise: Promise<Record<string, string[]>> | null = null;
function loadHomophones() {
  homophonesPromise ??= import("../data/kana-homophones.json").then(
    (m) => m.default as Record<string, string[]>
  );
  return homophonesPromise;
}

type Phase =
  | { kind: "intro" }
  | { kind: "waiting" } // start()는 불렀고 마이크가 열리길 기다리는 중
  | { kind: "listening" } // 2초 시계가 도는 중
  | { kind: "judging" } // 2초 안에 말은 시작했고 인식 결과를 기다리는 중
  | { kind: "result"; correct: boolean; heard: string | null; timeout: boolean }
  | { kind: "done" }
  | { kind: "fatal"; message: string };

type Miss = { cell: KanaCell; heard: string | null };

function KanaSpeakingGame({
  session,
  cells,
  mode,
  label,
  onClose,
  onRestart,
}: {
  /** 판 번호. 바뀌면 문제를 새로 섞은 새 판이 된다(안쪽만 리마운트 — 닫힘 애니메이션은 유지). */
  session: number;
  /** 출제 대상. `speakableCells`로 이미 거른 것. null이면 닫힌 상태. */
  cells: KanaCell[] | null;
  mode: ScriptMode;
  /** 인트로에 보여줄 출제 범위("히라가나 · 청음"). */
  label: string;
  onClose: () => void;
  /** 다시 하기 — 부모가 key를 바꿔 새 판으로 리마운트한다(KanjiQuizSheet와 같은 방식). */
  onRestart: () => void;
}) {
  return (
    <AnimatePresence>
      {cells && (
        <GameContent key={session} cells={cells} mode={mode} label={label} onClose={onClose} onRestart={onRestart} />
      )}
    </AnimatePresence>
  );
}

function GameContent({
  cells,
  mode,
  label,
  onClose,
  onRestart,
}: {
  cells: KanaCell[];
  mode: ScriptMode;
  label: string;
  onClose: () => void;
  onRestart: () => void;
}) {
  const [rounds] = useState(() => pickRounds(cells));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [misses, setMisses] = useState<Miss[]>([]);
  const celebrate = useConfettiStore((s) => s.celebrate);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  const supported = getSpeechRecognition() !== null;
  const recRef = useRef<KanaSpeechRecognition | null>(null);
  const timersRef = useRef<number[]>([]);
  // 판마다 올린다. 이전 판의 인식기가 늦게 보낸 이벤트(onend·onerror)가 지금 판을 건드리지 못하게.
  const tokenRef = useRef(0);
  const homophonesRef = useRef<Record<string, string[]>>({});
  // 콤보는 인식기 콜백(startRound 때 만든 클로저) 안에서 읽고 쓰므로 state가 아니라 ref가 원본이다.
  const comboRef = useRef(0);

  const current = rounds[index];
  const char = (cell: KanaCell) => (mode === "hiragana" ? cell.hiragana : cell.katakana);

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }

  function stopRecognition() {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onaudiostart = rec.onspeechstart = rec.onresult = rec.onerror = rec.onend = null;
    try {
      rec.abort();
    } catch {
      // 이미 끝난 인식기에 abort()를 불러도 브라우저에 따라 예외가 난다 — 멈추는 게 목적이라 무시.
    }
  }

  // 시트를 닫으면(언마운트) 마이크를 반드시 놓는다 — 안 그러면 탭에 녹음 표시가 남는다.
  useEffect(() => {
    const timers = timersRef;
    const recognition = recRef;
    const token = tokenRef;
    return () => {
      token.current += 1;
      timers.current.forEach((t) => window.clearTimeout(t));
      const rec = recognition.current;
      recognition.current = null;
      if (rec) {
        rec.onaudiostart = rec.onspeechstart = rec.onresult = rec.onerror = rec.onend = null;
        try {
          rec.abort();
        } catch {
          // stopRecognition()과 같은 이유로 무시
        }
      }
    };
  }, []);

  function endRound(roundIndex: number, correct: boolean, heard: string | null, timeout: boolean) {
    const cell = rounds[roundIndex];
    setPhase({ kind: "result", correct, heard, timeout });
    if (correct) {
      setScore((s) => s + 1);
      comboRef.current += 1;
      setCombo(comboRef.current);
      setBestCombo((b) => Math.max(b, comboRef.current));
      // 소리 내 읽어 맞힌 것도 그 글자를 공부한 것이다(Pre-N5 진도). XP는 게임 완주에서
      // 따로 주므로 여기서는 기록만 남긴다 — 오십음도 칸을 누를 때처럼 처음 한 번만.
      const kana = char(cell);
      const studied = useLearnerMemoryStore
        .getState()
        .events.some((e) => e.type === "kana-studied" && e.subject === kana);
      if (!studied) recordStudyEvent({ type: "kana-studied", subject: kana });
      timersRef.current.push(window.setTimeout(() => goNext(roundIndex), ADVANCE_MS));
    } else {
      comboRef.current = 0;
      setCombo(0);
      setMisses((m) => [...m, { cell, heard }]);
    }
  }

  function goNext(roundIndex: number) {
    clearTimers();
    if (roundIndex + 1 >= rounds.length) {
      stopRecognition();
      setPhase({ kind: "done" });
      // 게임 완주라는 명확한 학습 행동에 한 번만(한자 퀴즈와 같은 규칙). 맞힌 개수와 무관하다.
      recordProgress(XP_REWARDS.kanaSpeakingCompleted);
      return;
    }
    setIndex(roundIndex + 1);
    void startRound(roundIndex + 1);
  }

  async function startRound(roundIndex: number) {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    clearTimers();
    stopRecognition();
    // 정답 듣기(TTS)가 아직 나오고 있으면 마이크가 그 소리를 듣고 "맞았다"고 한다.
    window.speechSynthesis?.cancel();

    const token = ++tokenRef.current;
    const stale = () => token !== tokenRef.current;
    setPhase({ kind: "waiting" });
    homophonesRef.current = await loadHomophones().catch(() => ({}));
    if (stale()) return;

    const cell = rounds[roundIndex];
    const homophones = homophonesRef.current[cell.hiragana] ?? [];
    const rec = new Recognition();
    rec.lang = "ja-JP";
    rec.continuous = false;
    // interim을 켜야 말하는 도중에 맞는 순간 바로 끊을 수 있다(최종 결과까지 기다리면 한 박자 늦다).
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    recRef.current = rec;

    let speechStarted = false;
    let lastHeard: string | null = null;
    const finish = (correct: boolean, heard: string | null, timeout: boolean) => {
      if (stale()) return;
      tokenRef.current += 1; // 이 판의 나머지 이벤트는 전부 무시
      clearTimers();
      stopRecognition();
      endRound(roundIndex, correct, heard, timeout);
    };
    const fail = (message: string) => {
      if (stale()) return;
      tokenRef.current += 1;
      clearTimers();
      stopRecognition();
      setPhase({ kind: "fatal", message });
    };

    rec.onaudiostart = () => {
      if (stale()) return;
      setPhase({ kind: "listening" });
      timersRef.current.push(
        window.setTimeout(() => {
          if (stale()) return;
          if (!speechStarted && lastHeard === null) {
            finish(false, null, true);
            return;
          }
          setPhase({ kind: "judging" });
          timersRef.current.push(window.setTimeout(() => finish(false, lastHeard, true), GRACE_MS));
        }, LIMIT_MS)
      );
    };
    rec.onspeechstart = () => {
      speechStarted = true;
    };
    rec.onresult = (event) => {
      const { texts, isFinal } = transcriptsOf(event);
      if (texts.length === 0) return;
      lastHeard = texts[0];
      if (matchesKana(texts, cell, homophones)) finish(true, texts[0], false);
      else if (isFinal) finish(false, texts[0], false);
    };
    rec.onerror = (event) => {
      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          fail("마이크 권한이 필요해요. 주소창 옆 🔒 아이콘에서 마이크를 허용한 뒤 다시 시작해주세요.");
          return;
        case "audio-capture":
          fail("마이크를 찾지 못했어요. 마이크가 연결돼 있는지 확인해주세요.");
          return;
        case "network":
          fail("음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.");
          return;
        case "language-not-supported":
          fail("이 브라우저의 음성 인식은 일본어를 지원하지 않아요.");
          return;
        case "no-speech":
          finish(false, lastHeard, lastHeard === null);
          return;
        default:
          // aborted: 우리가 멈춘 것. 나머지는 onend가 판을 마무리한다.
          return;
      }
    };
    rec.onend = () => finish(false, lastHeard, lastHeard === null);

    try {
      rec.start();
    } catch {
      fail("음성 인식을 시작하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  const total = rounds.length;
  const ratio = total > 0 ? score / total : 0;

  // 완주 축하는 결과 화면에 들어설 때 한 번만(8할 이상).
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (phase.kind === "done" && ratio >= 0.8 && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate();
    }
  }, [phase.kind, ratio, celebrate]);

  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-[85svh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-primary">🎤 2초 발음 게임</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400" aria-label="닫기">
            ×
          </button>
        </div>

        {phase.kind === "intro" && (
          <div className="mt-4">
            <ul className="flex flex-col gap-2 rounded-2xl bg-primary/5 p-4 text-sm text-gray-700">
              <li>🔤 글자가 나오면 <b>2초 안에</b> 소리 내 읽어요.</li>
              <li>🎯 {label}에서 {total}문제가 나와요.</li>
              <li>🤫 조용한 곳에서 한 글자만 또렷하게 말하면 잘 알아들어요.</li>
            </ul>
            <p className="mt-3 text-xs text-gray-400">
              음성 인식은 브라우저 기능을 써요. Chrome에서는 목소리가 구글 서버로 보내져 인식돼요.
            </p>
            {supported ? (
              <button
                onClick={() => void startRound(0)}
                disabled={total === 0}
                className="btn-press mt-5 w-full rounded-2xl bg-primary py-3 font-bold text-white disabled:opacity-40"
                style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
              >
                시작하기
              </button>
            ) : (
              <p className="mt-5 rounded-xl bg-warning/10 p-3 text-sm text-warning">
                이 브라우저는 음성 인식을 지원하지 않아요. Chrome이나 Safari에서 해보세요.
              </p>
            )}
          </div>
        )}

        {phase.kind === "fatal" && (
          <div className="mt-6 text-center">
            <span className="text-4xl">🎙️</span>
            <p className="mt-2 text-sm text-gray-700">{phase.message}</p>
            <button
              onClick={() => void startRound(index)}
              className="btn-press mt-5 w-full rounded-2xl bg-primary py-3 font-bold text-white"
              style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
            >
              다시 시도
            </button>
          </div>
        )}

        {(phase.kind === "waiting" ||
          phase.kind === "listening" ||
          phase.kind === "judging" ||
          phase.kind === "result") &&
          current && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>
                  {index + 1} / {total}
                </span>
                <span>
                  ⭐ {score}
                  {combo >= 2 && <span className="ml-2 text-warning">🔥 {combo}연속</span>}
                </span>
              </div>

              <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">
                {phase.kind === "listening" && (
                  <motion.div
                    key={index}
                    className="h-full rounded-full bg-primary"
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: LIMIT_MS / 1000, ease: "linear" }}
                  />
                )}
              </div>

              <motion.div
                key={`${index}-${phase.kind === "result" ? String(phase.correct) : "q"}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`mt-6 flex flex-col items-center rounded-3xl border-4 py-6 ${
                  phase.kind === "result"
                    ? phase.correct
                      ? "border-primary bg-primary/10"
                      : "animate-shake border-danger bg-danger/10"
                    : "border-transparent"
                }`}
              >
                <span className="font-ja text-8xl leading-none">{char(current)}</span>
                {phase.kind === "result" && (
                  <span className="mt-2 text-lg text-gray-500">{current.romaji}</span>
                )}
              </motion.div>

              <div className="mt-4 min-h-24 text-center">
                {phase.kind === "waiting" && <p className="text-sm text-gray-400">마이크 준비 중…</p>}
                {phase.kind === "listening" && <p className="text-lg text-primary">🎤 지금 말하세요!</p>}
                {phase.kind === "judging" && <p className="text-sm text-gray-400">듣고 있어요…</p>}
                {phase.kind === "result" && (
                  <>
                    <p className={`text-lg font-bold ${phase.correct ? "text-primary" : "text-danger"}`}>
                      {phase.correct ? "✅ 정확해요!" : phase.timeout && !phase.heard ? "⏰ 시간 초과" : "❌ 아쉬워요"}
                    </p>
                    {phase.heard && (
                      <p className="mt-1 font-mixed text-sm text-gray-500">들린 말: 「{phase.heard}」</p>
                    )}
                    {!phase.correct && (
                      <div className="mt-3 flex items-center gap-3">
                        <SpeakButton text={char(current)} label={`${char(current)} 정답 발음 듣기`} size="md" />
                        <button
                          onClick={() => goNext(index)}
                          className="btn-press flex-1 rounded-2xl bg-primary py-3 font-bold text-white"
                          style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
                        >
                          {index + 1 >= total ? "결과 보기" : "다음 ▶"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

        {phase.kind === "done" && (
          <div className="mt-6 flex flex-col items-center gap-1 text-center">
            <span className="text-4xl">{ratio === 1 ? "🏆" : ratio >= 0.8 ? "🎉" : "💪"}</span>
            <p className="text-xl font-bold text-primary">
              {score} / {total} 정답!
            </p>
            {bestCombo >= 2 && <p className="text-sm text-gray-500">최고 {bestCombo}연속 🔥</p>}

            {misses.length > 0 && (
              <div className="mt-4 w-full rounded-2xl bg-gray-50 p-4 text-left">
                <p className="text-xs text-gray-400">다시 들어볼 글자</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {misses.map(({ cell }) => (
                    <li key={cell.hiragana} className="flex items-center gap-1 rounded-xl bg-white px-2 py-1">
                      <span className="font-ja text-2xl">{char(cell)}</span>
                      <span className="text-xs text-gray-400">{cell.romaji}</span>
                      <SpeakButton text={char(cell)} label={`${char(cell)} 발음 듣기`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex w-full gap-2">
              <button onClick={onClose} className="flex-1 rounded-2xl border-2 border-gray-100 py-3 text-gray-500">
                닫기
              </button>
              <button
                onClick={onRestart}
                className="btn-press flex-1 rounded-2xl bg-primary py-3 font-bold text-white"
                style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
              >
                다시 하기
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default KanaSpeakingGame;
