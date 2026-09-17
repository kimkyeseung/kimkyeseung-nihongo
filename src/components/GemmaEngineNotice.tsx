import { Link } from "react-router-dom";
import { GEMMA_MODEL, formatBytes } from "../lib/gemmaModel";
import { useAiEngineStore } from "../stores/aiEngineStore";

/**
 * Gemma 4를 쓰기로 해놨는데 지금 당장은 못 쓰는 두 경우를 안내한다.
 *
 * `PromptApiUnsupportedNotice`(브라우저가 Prompt API 자체를 지원 안 함)와는 원인도 해결법도
 * 달라서 따로 뒀다 — 그쪽 문구를 그대로 쓰면 "브라우저가 Prompt API를 지원하지 않는다"는
 * 엉뚱한 안내가 된다. 여기서는 되돌아갈 길(내장 AI로 전환)이 항상 있으므로 버튼으로 제공한다.
 */
function GemmaEngineNotice({
  reason,
  feature,
}: {
  reason: "model-missing" | "unsupported";
  feature: string;
}) {
  const setEngine = useAiEngineStore((s) => s.setEngine);
  const missing = reason === "model-missing";

  return (
    <div className="m-4 rounded-2xl bg-info/10 p-5 text-sm text-gray-700">
      <p className="font-bold text-info">
        {missing
          ? `${GEMMA_MODEL.label} 모델이 아직 없습니다.`
          : `이 브라우저에서는 ${GEMMA_MODEL.label}를 실행할 수 없습니다.`}
      </p>
      <p className="mt-2">
        {missing ? (
          <>
            {feature} 기능을 {GEMMA_MODEL.label}로 쓰도록 설정해두셨지만, 모델 파일(
            {formatBytes(GEMMA_MODEL.bytes)})을 아직 내려받지 않았습니다.
          </>
        ) : (
          <>
            {GEMMA_MODEL.label}는 WebGPU가 필요합니다 (GPU 메모리 약 1.8GB). 데스크톱
            Chrome/Edge에서 다시 시도하거나, Chrome 내장 AI로 전환하세요.
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {missing && (
          <Link
            to="/"
            className="btn-press rounded-2xl bg-info px-4 py-2 text-white"
            style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.2)" }}
          >
            대문에서 모델 받기
          </Link>
        )}
        <button
          onClick={() => setEngine("prompt-api")}
          className="btn-press rounded-2xl bg-white px-4 py-2 text-gray-600"
          style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.1)" }}
        >
          Chrome 내장 AI로 전환
        </button>
      </div>
    </div>
  );
}

export default GemmaEngineNotice;
