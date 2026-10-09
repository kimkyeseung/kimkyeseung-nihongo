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

export type PhonemeModel = {
  backend: PhonemeBackend;
  loadMs: number;
  recognize: (samples: Float32Array) => Promise<{ phonemes: string[]; ms: number }>;
  release: () => Promise<void>;
};

export async function loadPhonemeModel(
  modelUrl: string,
  vocabUrl: string,
  backend: PhonemeBackend
): Promise<PhonemeModel> {
  const t0 = performance.now();
  const ort = (await import(/* @vite-ignore */ `${ORT_CDN}ort.webgpu.min.mjs`)) as typeof Ort;
  ort.env.wasm.wasmPaths = ORT_CDN;
  const vocabJson = (await (await fetch(vocabUrl)).json()) as Record<string, number>;
  const vocab: string[] = [];
  for (const [tok, id] of Object.entries(vocabJson)) vocab[id] = tok;
  const session = await ort.InferenceSession.create(modelUrl, { executionProviders: [backend] });
  const loadMs = Math.round(performance.now() - t0);

  return {
    backend,
    loadMs,
    async recognize(samples) {
      const s = performance.now();
      const input = new ort.Tensor("float32", samples, [1, samples.length]);
      const out = await session.run({ input_values: input });
      const logits = out.logits;
      const [, frames, classes] = logits.dims;
      const data = (await logits.getData()) as Float32Array;
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
      input.dispose();
      logits.dispose();
      return { phonemes: decodeCtc(ids, vocab), ms: Math.round(performance.now() - s) };
    },
    release: () => session.release(),
  };
}
