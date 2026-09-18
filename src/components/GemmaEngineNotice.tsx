import { Link } from "react-router-dom";
import { GEMMA_MODEL, formatBytes } from "../lib/gemmaModel";
import { detectAiCapability } from "../lib/aiCapability";
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
  // 내장 AI가 없으면 "내장 AI로 전환"은 아무 데도 데려가지 못한다 — 그때는 Chrome을 권한다.
  const { promptApi } = detectAiCapability();

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
            {GEMMA_MODEL.label}는 WebGPU가 필요합니다 (GPU 메모리 약 1.8GB). WebGPU를 지원하는
            데스크톱 브라우저(Chrome·Edge·Safari 26+·Firefox 141+)에서 다시 시도해 주세요.
            {promptApi && " 또는 이 브라우저의 내장 AI로 전환하면 지금 바로 쓸 수 있습니다."}
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
        {promptApi ? (
          <button
            onClick={() => setEngine("prompt-api")}
            className="btn-press rounded-2xl bg-white px-4 py-2 text-gray-600"
            style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.1)" }}
          >
            Chrome 내장 AI로 전환
          </button>
        ) : (
          // 내장 AI도 없고 Gemma도 못 쓰는 막다른 길 — 최후의 보루를 안내한다.
          !missing && (
            <a
              href="https://www.google.com/chrome/canary/"
              target="_blank"
              rel="noreferrer"
              className="btn-press rounded-2xl bg-primary px-4 py-2 font-bold text-white"
              style={{ ["--btn-shadow" as string]: "#3d9401" }}
            >
              Chrome Canary 다운로드
            </a>
          )
        )}
      </div>
    </div>
  );
}

export default GemmaEngineNotice;
