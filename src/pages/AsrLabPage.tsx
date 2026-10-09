import { useEffect, useRef, useState } from "react";
import { GOJUON_SECTIONS } from "../data/gojuon";
import { encodeWav, VoiceCapture, type VoiceClip } from "../lib/voiceCapture";
import { useDebugMode } from "../stores/pageStateStore";

/**
 * 발음 인식 시험장(디버그 전용, `/lab/asr`). 실제 목소리로 가나를 녹음해 파일로 내려받는다 —
 * 그 파일로 후보 모델(가나 CTC·음소 CTC·Gemma 오디오)을 오프라인에서 비교한다. 브라우저 음성 인식은
 * 가나 한 글자를 받아 적지 못했고(Chrome은 결과 없이 end, 웨일은 빈 결과), 합성 음성은 한 글자를
 * 이상하게 읽어서 시험 재료로 못 썼다.
 *
 * 글자마다 두 번 녹음한다: "한 번"과 "세 번 이어"(か か か) — 이어 읽은 소리는 모델이 잘 받아 적어서,
 * 게임 방식을 바꿀지 판단하려는 것이다.
 */

type Mode = "single" | "triple";
type Prompt = { kana: string; mode: Mode };
type Recorded = Prompt & { clip: VoiceClip; url: string };

const POOL = GOJUON_SECTIONS.filter((s) => ["seion", "dakuon", "handakuon"].includes(s.id))
  .flatMap((s) => s.rows.flatMap((r) => r.cells))
  .filter((c) => c !== null)
  .map((c) => c.hiragana);

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function AsrLabPage() {
  const debug = useDebugMode((s) => s.enabled);
  const [count, setCount] = useState(15);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "listening" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const captureRef = useRef<VoiceCapture | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      captureRef.current?.close();
    },
    []
  );

  if (!debug) {
    return <p className="p-6 text-sm text-gray-500">디버그 모드(`?debug=1`)에서만 열리는 시험 화면이에요.</p>;
  }

  async function recordAt(list: Prompt[], i: number) {
    if (i >= list.length) {
      setStatus("idle");
      return;
    }
    setIndex(i);
    setStatus("listening");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      captureRef.current ??= await VoiceCapture.open();
      const clip = await captureRef.current.listen({
        endSilenceMs: list[i].mode === "triple" ? 700 : 450,
        maxMs: list[i].mode === "triple" ? 5000 : 3000,
        onLevel: (l) => setLevel(l),
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!clip) {
        // 말이 안 들렸다 — 같은 글자를 다시 듣는다.
        void recordAt(list, i);
        return;
      }
      setStatus("saving");
      const url = URL.createObjectURL(new Blob([encodeWav(clip.samples)], { type: "audio/wav" }));
      setRecorded((r) => [...r, { ...list[i], clip, url }]);
      window.setTimeout(() => void recordAt(list, i + 1), 500);
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }

  function start() {
    const kana = shuffle(POOL).slice(0, count);
    const list = kana.flatMap((k): Prompt[] => [
      { kana: k, mode: "single" },
      { kana: k, mode: "triple" },
    ]);
    recorded.forEach((r) => URL.revokeObjectURL(r.url));
    setRecorded([]);
    setPrompts(list);
    void recordAt(list, 0);
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("idle");
  }

  function redoLast() {
    abortRef.current?.abort();
    const last = recorded.at(-1);
    if (!last) return;
    URL.revokeObjectURL(last.url);
    setRecorded((r) => r.slice(0, -1));
    void recordAt(prompts, Math.max(0, index - (status === "listening" ? 1 : 0)));
  }

  function download() {
    const file = {
      format: "kana-asr-lab",
      version: 1,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      sampleRate: 16000,
      clips: recorded.map((r) => ({
        target: r.kana,
        mode: r.mode,
        onsetMs: r.clip.onsetMs,
        durationMs: r.clip.durationMs,
        wav: toBase64(encodeWav(r.clip.samples)),
      })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    a.download = `kana-asr-lab-${Date.now()}.json`;
    a.click();
  }

  const current = prompts[index];
  const running = status === "listening" || status === "saving";

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <h2 className="text-xl text-primary">🧪 발음 인식 시험</h2>
      <p className="mt-2 text-sm text-gray-500">
        글자마다 <b>한 번</b>, 그다음 <b>세 번 이어서</b>(か か か) 읽어요. 말이 끝나면 저절로 다음으로 넘어가요. 다
        하면 파일을 내려받아 전달해 주세요. 녹음은 이 브라우저 밖으로 나가지 않아요.
      </p>

      {!running && (
        <div className="mt-4 flex items-center gap-3">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-xl border-2 border-gray-100 bg-white px-3 py-2"
          >
            {[5, 10, 15, 25, 40].map((n) => (
              <option key={n} value={n}>
                {n}글자 ({n * 2}번 녹음)
              </option>
            ))}
          </select>
          <button onClick={start} className="flex-1 rounded-2xl bg-primary py-3 font-bold text-white">
            {recorded.length ? "처음부터 다시" : "시작"}
          </button>
        </div>
      )}

      {status === "error" && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {running && current && (
        <div className="mt-6 flex flex-col items-center rounded-3xl border-4 border-primary/20 py-6">
          <p className="text-sm text-gray-400">
            {index + 1} / {prompts.length}
          </p>
          <p className="mt-2 font-ja text-8xl leading-none">
            {current.mode === "single" ? current.kana : `${current.kana} ${current.kana} ${current.kana}`}
          </p>
          <p className="mt-3 text-lg text-primary">
            {current.mode === "single" ? "한 번 읽어요" : "세 번 이어서 읽어요"}
          </p>
          <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, level * 600)}%` }} />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={redoLast} disabled={!recorded.length} className="rounded-xl border-2 border-gray-100 px-3 py-2 text-sm text-gray-500 disabled:opacity-40">
              ↩ 방금 것 다시
            </button>
            <button onClick={stop} className="rounded-xl border-2 border-gray-100 px-3 py-2 text-sm text-gray-500">
              ■ 그만
            </button>
          </div>
        </div>
      )}

      {recorded.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">녹음 {recorded.length}개</p>
            <button onClick={download} disabled={running} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
              ⬇ 파일 내려받기
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {recorded.map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                <span className="w-16 font-ja text-xl">{r.mode === "single" ? r.kana : `${r.kana}×3`}</span>
                <span className="flex-1 text-gray-400">
                  시작 {r.clip.onsetMs}ms · 길이 {r.clip.durationMs}ms
                </span>
                <button onClick={() => void new Audio(r.url).play()} aria-label="들어보기">
                  ▶️
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AsrLabPage;
