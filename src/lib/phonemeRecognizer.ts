import type * as Ort from "onnxruntime-web";
import { decodeCtc } from "./kanaPhonemes";

/**
 * 음소 인식 모델(HuBERT-base 음소 CTC, prj-beatrice/japanese-hubert-base-phoneme-ctc-v3을 ONNX로 바꾼 것)을
 * 브라우저에서 돌린다(시험 중, `/lab/asr`). 입력은 16kHz 모노 그대로다 — 모델 설정이 정규화를 하지 않는다
 * (`do_normalize: false`).
 *
 * onnxruntime-web은 **실행 코드까지 jsDelivr에서** 받는다(LiteRT-LM과 같은 판단). npm 패키지를 import하면
 * 번들러가 26.8MB짜리 WASM을 배포물에 넣고, PWA 프리캐시가 그 크기에 걸려 빌드가 실패했다. npm 패키지는
 * 타입(`import type`)에만 쓴다.
 */

const ORT_VERSION = "1.30.0";
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export type PhonemeBackend = "wasm" | "webgpu";

/** 모델 출력 그대로 — `judgeByAlignment`가 받는 모양. */
export type PhonemeLogits = { logits: Float32Array; frames: number; classes: number; ms: number };

export type PhonemeModel = {
  backend: PhonemeBackend;
  loadMs: number;
  vocab: readonly string[];
  run: (samples: Float32Array) => Promise<PhonemeLogits>;
  recognize: (samples: Float32Array) => Promise<{ phonemes: string[]; ms: number }>;
  release: () => Promise<void>;
};

/**
 * 모델 어휘(vocab.json). 모델 파일과 짝이라 파일을 바꾸면 같이 바꿀 것 — 게임은 OPFS의 모델 하나만 받고
 * 어휘는 코드에 둔다(작은 파일 하나 때문에 저장소·다운로드 경로를 둘로 만들지 않으려고).
 */
export const PHONEME_VOCAB: readonly string[] = Object.entries({
  EOS: 3, I: 9, N: 28, PAD: 0, SOS: 2, U: 10, UNK: 1, a: 4, b: 19, by: 36, ch: 31, cl: 29, d: 16, dy: 43, e: 7,
  f: 25, fy: 41, g: 12, gw: 45, gy: 34, h: 18, hy: 35, i: 5, j: 26, k: 11, kw: 44, ky: 33, m: 21, my: 38, n: 17,
  ny: 39, o: 8, p: 20, pau: 46, py: 37, r: 23, ry: 40, s: 13, sh: 30, sil: 47, t: 15, ts: 32, ty: 42, u: 6, v: 27,
  w: 24, y: 22, z: 14,
}).reduce<string[]>((v, [tok, id]) => ((v[id] = tok), v), []);

/**
 * 모델을 연다. `source`는 주소(시험장) 또는 OPFS에서 읽은 바이트(게임). `backend`를 안 주면 WebGPU를 먼저
 * 해 보고 안 되면 WASM으로 — fp16 + WebGPU면 한 글자 20~30ms, WASM이면 약 0.4초(시험장에서 쟀다).
 */
export async function loadPhonemeModel(
  source: string | Uint8Array,
  backend?: PhonemeBackend
): Promise<PhonemeModel> {
  const t0 = performance.now();
  const ort = (await import(/* @vite-ignore */ `${ORT_CDN}ort.webgpu.min.mjs`)) as typeof Ort;
  ort.env.wasm.wasmPaths = ORT_CDN;
  const vocab = PHONEME_VOCAB;
  const tryOrder: PhonemeBackend[] = backend ? [backend] : "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
  let session: Ort.InferenceSession | null = null;
  let used: PhonemeBackend = tryOrder[0];
  let lastError: unknown = null;
  for (const b of tryOrder) {
    try {
      session =
        typeof source === "string"
          ? await ort.InferenceSession.create(source, { executionProviders: [b] })
          : await ort.InferenceSession.create(source, { executionProviders: [b] }); // 두 오버로드라 갈라 부른다
      used = b;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!session) throw lastError instanceof Error ? lastError : new Error("발음 판정 모델을 열지 못했어요");
  const s0 = session;
  const loadMs = Math.round(performance.now() - t0);

  async function run(samples: Float32Array): Promise<PhonemeLogits> {
    const s = performance.now();
    const input = new ort.Tensor("float32", samples, [1, samples.length]);
    const out = await s0.run({ input_values: input });
    const [, frames, classes] = out.logits.dims;
    const logits = ((await out.logits.getData()) as Float32Array).slice();
    input.dispose();
    out.logits.dispose();
    return { logits, frames, classes, ms: Math.round(performance.now() - s) };
  }

  return {
    backend: used,
    loadMs,
    vocab,
    run,
    async recognize(samples) {
      const { logits: data, frames, classes, ms } = await run(samples);
      const ids = new Int32Array(frames);
      for (let t = 0; t < frames; t++) {
        let best = 0;
        let bestVal = -Infinity;
        for (let c = 0; c < classes; c++) {
          const v = data[t * classes + c];
          if (v > bestVal) {
            bestVal = v;
            best = c;
          }
        }
        ids[t] = best;
      }
      return { phonemes: decodeCtc(ids, vocab), ms };
    },
    release: () => s0.release(),
  };
}
