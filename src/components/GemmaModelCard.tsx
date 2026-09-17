import { useGemmaModel } from "../hooks/useGemmaModel";
import { GEMMA_MODEL, formatBytes, formatEta } from "../lib/gemmaModel";
import { useAiEngineStore } from "../stores/aiEngineStore";
import ProgressBar from "./ProgressBar";

/**
 * 대문에서 Gemma 4 모델을 직접 내려받아 회화·작문에 쓰게 해주는 카드.
 *
 * 2GB짜리라 자동으로는 절대 받지 않는다 — 버튼을 누르는 것이 곧 동의다.
 * Chrome 내장 Prompt API는 모델을 고를 수 없으므로, 이건 "모델 교체"가 아니라
 * WebGPU에서 도는 별도 엔진을 추가로 켜는 선택지다.
 */
function GemmaModelCard() {
  const { status, progress, error, download, cancel, remove } = useGemmaModel();
  const engine = useAiEngineStore((s) => s.engine);
  const setEngine = useAiEngineStore((s) => s.setEngine);

  if (status === "unsupported") {
    return (
      <div className="rounded-3xl border-4 border-gray-100 bg-white p-4 sm:p-5">
        <p className="text-gray-700">🧠 Gemma 4 직접 실행</p>
        <p className="mt-1 text-sm text-gray-500">
          이 브라우저에서는 쓸 수 없습니다. WebGPU를 지원하는 데스크톱 Chrome/Edge가 필요합니다
          (GPU 메모리 약 1.8GB).
        </p>
      </div>
    );
  }

  const usingGemma = engine === "gemma4";

  return (
    <div className="rounded-3xl border-4 border-info/20 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-gray-700">🧠 Gemma 4 직접 실행 (선택)</p>
          <p className="mt-1 text-sm text-gray-500">
            Chrome 내장 AI 대신 {GEMMA_MODEL.label} 모델을 직접 내려받아 WebGPU로 돌립니다. 회화
            응답과 작문 첨삭 품질이 올라가고, 내장 AI가 없는 브라우저에서도 쓸 수 있습니다.
          </p>
        </div>
        {status === "installed" && <span className="text-2xl">✅</span>}
      </div>

      {status === "checking" && <p className="mt-3 text-sm text-gray-400">설치 여부 확인 중...</p>}

      {(status === "not-installed" || status === "error") && (
        <>
          <button
            onClick={download}
            className="btn-press mt-3 w-full rounded-2xl bg-info px-4 py-3 text-white"
            style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.2)" }}
          >
            모델 내려받기 ({formatBytes(GEMMA_MODEL.bytes)})
          </button>
          <p className="mt-2 text-xs text-gray-400">
            한 번만 받으면 브라우저에 저장되어 다음부터는 오프라인으로 동작합니다. 데이터
            요금제에서는 주의하세요.
          </p>
          {status === "error" && error && (
            <p className="animate-shake mt-2 rounded-2xl bg-danger/10 p-2 text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}

      {status === "downloading" && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-500">
              {progress
                ? `${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)}`
                : "연결 중..."}
            </span>
            <span className="text-info tabular-nums">
              {progress ? Math.round(progress.ratio * 100) : 0}%
            </span>
          </div>
          <ProgressBar
            className="mt-2"
            percent={progress ? progress.ratio * 100 : 0}
            label="Gemma 4 모델 내려받는 중"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">
              {progress
                ? (formatEta(progress.totalBytes - progress.receivedBytes, progress.bytesPerSecond) ??
                  "남은 시간 계산 중...")
                : ""}
            </span>
            <button onClick={cancel} className="text-xs text-gray-400 underline">
              취소
            </button>
          </div>
        </div>
      )}

      {status === "installed" && (
        <div className="mt-3">
          <div className="flex gap-2">
            <button
              onClick={() => setEngine("prompt-api")}
              className={`flex-1 rounded-2xl px-3 py-2 text-sm ${
                usingGemma ? "bg-gray-50 text-gray-500" : "bg-primary/10 text-primary"
              }`}
            >
              Chrome 내장 AI
            </button>
            <button
              onClick={() => setEngine("gemma4")}
              className={`flex-1 rounded-2xl px-3 py-2 text-sm ${
                usingGemma ? "bg-info/10 text-info" : "bg-gray-50 text-gray-500"
              }`}
            >
              {GEMMA_MODEL.label}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">
              {usingGemma ? "회화·작문이 Gemma 4로 동작합니다." : "회화·작문이 Chrome 내장 AI로 동작합니다."}
            </span>
            <button onClick={remove} className="text-xs text-gray-400 underline">
              모델 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GemmaModelCard;
