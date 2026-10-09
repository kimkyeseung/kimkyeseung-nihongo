import { useEffect, useRef, useState } from "react";
import { GOJUON_SECTIONS } from "../data/gojuon";
import { judgePhonemes, type PhonemeJudgement } from "../lib/kanaPhonemes";
import { loadPhonemeModel, type PhonemeBackend, type PhonemeModel } from "../lib/phonemeRecognizer";
import { encodeWav, VoiceCapture, type VoiceClip } from "../lib/voiceCapture";
import { useDebugMode } from "../stores/pageStateStore";

/**
 * 발음 인식 시험장(디버그 전용, `/lab/asr`). 실제 목소리로 가나를 녹음하고, 브라우저 안에서 음소 인식
 * 모델로 바로 판정해 본다. 녹음은 파일로 내려받아 오프라인 비교에도 쓴다.
 *
 * 배경: 브라우저 음성 인식은 가나 한 글자를 받아 적지 못했다(Chrome은 결과 없이 end, 웨일은 빈 결과).
 * 오프라인 시험에서 음소 CTC 모델이 실제 목소리 한 글자를 15개 중 12개(정확+거의) 받아들였다.
 *
 * 모델 파일은 저장소 밖(`lab-models/`, git 제외)에 두고 개발 서버만 `/lab-models/*`로 내보낸다(vite.config.ts).
 */

type Mode = "single" | "triple";
type Prompt = { kana: string; mode: Mode };
type Result = { phonemes: string[]; ms: number; judgement: PhonemeJudgement };
type Recorded = Prompt & { clip: VoiceClip; url: string; result?: Result };

const MODEL_DIR = "/lab-models/hubert-phoneme-v3";
const VARIANTS = {
  q8: { file: "model_q8_matmul.onnx", label: "int8 (122MB)" },
  fp16: { file: "model_fp16.onnx", label: "fp16 (189MB)" },
  fp32: { file: "model.onnx", label: "fp32 (378MB)" },
} as const;

const POOL = GOJUON_SECTIONS.filter((s) => ["seion", "dakuon", "handakuon"].includes(s.id))
  .flatMap((s) => s.rows.flatMap((r) => r.cells))
  .filter((c) => c !== null)
  .map((c) => c.hiragana);

const MARK: Record<PhonemeJudgement, string> = { exact: "✅", near: "🟡", wrong: "❌" };

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

/** 내려받은 파일의 WAV(16bit 모노)를 다시 샘플로. */
function decodeWav(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  let o = 12;
  while (o < bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4));
    const size = view.getUint32(o + 4, true);
    if (id === "data") {
      const out = new Float32Array(size / 2);
      for (let i = 0; i < out.length; i++) out[i] = view.getInt16(o + 8 + i * 2, true) / 32768;
      return out;
    }
    o += 8 + size + (size % 2);
  }
  return new Float32Array();
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
  const [variant, setVariant] = useState<keyof typeof VARIANTS>("q8");
  const [backend, setBackend] = useState<PhonemeBackend>("wasm");
  const [model, setModel] = useState<PhonemeModel | null>(null);
  const [modelState, setModelState] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const captureRef = useRef<VoiceCapture | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelRef = useRef<PhonemeModel | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      captureRef.current?.close();
      void modelRef.current?.release();
    },
    []
  );

  if (!debug) {
    return <p className="p-6 text-sm text-gray-500">디버그 모드(`?debug=1`)에서만 열리는 시험 화면이에요.</p>;
  }

  async function loadModel() {
    setModelState("불러오는 중…");
    try {
      await modelRef.current?.release();
      const m = await loadPhonemeModel(`${MODEL_DIR}/${VARIANTS[variant].file}`, `${MODEL_DIR}/vocab.json`, backend);
      // 첫 추론은 준비 비용이 섞이므로 1초짜리 무음으로 한 번 데운다.
      const warm = await m.recognize(new Float32Array(16000));
      modelRef.current = m;
      setModel(m);
      setModelState(`${VARIANTS[variant].label} · ${backend} · 불러오기 ${m.loadMs}ms · 첫 추론 ${warm.ms}ms`);
    } catch (e) {
      setModelState(`실패: ${(e as Error).message}`);
    }
  }

  async function judge(r: Recorded): Promise<Recorded> {
    const m = modelRef.current;
    if (!m) return r;
    const { phonemes, ms } = await m.recognize(r.clip.samples);
    return { ...r, result: { phonemes, ms, judgement: judgePhonemes(phonemes, r.kana) } };
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
      const item = await judge({ ...list[i], clip, url });
      setRecorded((r) => [...r, item]);
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

  async function rejudgeAll() {
    setBatchNote("판정 중…");
    const out: Recorded[] = [];
    for (const r of recorded) out.push(await judge(r));
    setRecorded(out);
    setBatchNote("");
  }

  async function importFile(file: File) {
    const data = JSON.parse(await file.text()) as {
      clips: { target: string; mode: Mode; onsetMs: number; durationMs: number; wav: string }[];
    };
    const items = data.clips.map((c): Recorded => {
      const samples = decodeWav(c.wav);
      return {
        kana: c.target,
        mode: c.mode,
        clip: { samples, onsetMs: c.onsetMs, durationMs: c.durationMs },
        url: URL.createObjectURL(new Blob([encodeWav(samples)], { type: "audio/wav" })),
      };
    });
    recorded.forEach((r) => URL.revokeObjectURL(r.url));
    setRecorded(items);
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
        ...(r.result && { phonemes: r.result.phonemes.join(" "), judgement: r.result.judgement, ms: r.result.ms }),
      })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    a.download = `kana-asr-lab-${Date.now()}.json`;
    a.click();
  }

  const current = prompts[index];
  const running = status === "listening" || status === "saving";
  const judged = recorded.filter((r) => r.result);
  const summary = (mode: Mode) => {
    const xs = judged.filter((r) => r.mode === mode);
    if (!xs.length) return null;
    const c = (j: PhonemeJudgement) => xs.filter((r) => r.result!.judgement === j).length;
    const avg = Math.round(xs.reduce((n, r) => n + r.result!.ms, 0) / xs.length);
    return `${mode === "single" ? "한 번" : "세 번"}: ✅${c("exact")} 🟡${c("near")} ❌${c("wrong")} / ${xs.length} · 평균 ${avg}ms`;
  };

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <h2 className="text-xl text-primary">🧪 발음 인식 시험</h2>
      <p className="mt-2 text-sm text-gray-500">
        글자마다 <b>한 번</b>, 그다음 <b>세 번 이어서</b>(か か か) 읽어요. 말이 끝나면 저절로 다음으로 넘어가요. 녹음과
        판정은 이 브라우저 밖으로 나가지 않아요.
      </p>

      <div className="mt-4 rounded-2xl bg-gray-50 p-3 text-sm">
        <p className="text-gray-500">음소 인식 모델 (HuBERT-base 음소 CTC v3)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={variant} onChange={(e) => setVariant(e.target.value as keyof typeof VARIANTS)} className="rounded-xl border-2 border-gray-100 bg-white px-2 py-1">
            {Object.entries(VARIANTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={backend} onChange={(e) => setBackend(e.target.value as PhonemeBackend)} className="rounded-xl border-2 border-gray-100 bg-white px-2 py-1">
            <option value="wasm">WASM (CPU)</option>
            <option value="webgpu">WebGPU</option>
          </select>
          <button onClick={() => void loadModel()} disabled={running} className="rounded-xl bg-info px-3 py-1 font-bold text-white disabled:opacity-40">
            불러오기
          </button>
        </div>
        {modelState && <p className="mt-2 text-xs text-gray-500">{modelState}</p>}
      </div>

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
            {recorded.length ? "처음부터 다시" : "녹음 시작"}
          </button>
        </div>
      )}
      {!running && (
        <label className="mt-2 block text-xs text-gray-400">
          예전 녹음 파일 불러오기:{" "}
          <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </label>
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
          {recorded.at(-1)?.result && (
            <p className="mt-3 font-mixed text-sm text-gray-500">
              방금: {recorded.at(-1)!.kana} → {MARK[recorded.at(-1)!.result!.judgement]} [{recorded.at(-1)!.result!.phonemes.join(" ")}]
            </p>
          )}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">녹음 {recorded.length}개</p>
            <div className="flex gap-2">
              <button onClick={() => void rejudgeAll()} disabled={running || !model} className="rounded-xl border-2 border-gray-100 px-3 py-2 text-sm text-gray-500 disabled:opacity-40">
                🔁 전부 다시 판정
              </button>
              <button onClick={download} disabled={running} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                ⬇ 파일 내려받기
              </button>
            </div>
          </div>
          {batchNote && <p className="mt-2 text-sm text-gray-400">{batchNote}</p>}
          {judged.length > 0 && (
            <p data-summary className="mt-2 rounded-xl bg-primary/5 p-2 text-sm text-gray-700">
              {[summary("single"), summary("triple")].filter(Boolean).join(" · ")}
            </p>
          )}
          <ul className="mt-2 flex flex-col gap-1">
            {recorded.map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                <span className="w-14 font-ja text-xl">{r.mode === "single" ? r.kana : `${r.kana}×3`}</span>
                <span className="min-w-0 flex-1 truncate text-gray-500">
                  {r.result ? (
                    <>
                      {MARK[r.result.judgement]} [{r.result.phonemes.join(" ")}] · {r.result.ms}ms
                    </>
                  ) : (
                    <span className="text-gray-400">
                      시작 {r.clip.onsetMs}ms · 길이 {r.clip.durationMs}ms
                    </span>
                  )}
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
