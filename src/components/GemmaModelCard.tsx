import { useGemmaModel } from "../hooks/useGemmaModel";
import { GEMMA_MODEL, formatBytes, formatEta } from "../lib/gemmaModel";
import { MOBILE_DOWNLOAD_WARNING, detectAiCapability } from "../lib/aiCapability";
import { useAiEngineStore } from "../stores/aiEngineStore";
import ProgressBar from "./ProgressBar";

/** Gemma도 못 쓰는 사람에게만 보여주는 최후의 안내(aiCapability.ts의 "chrome-fallback"). */
function ChromeCanaryFallback({ lead }: { lead: string }) {
  return (
    <>
      <p className="mt-1 text-sm text-gray-500">{lead}</p>
      <a
        href="https://www.google.com/chrome/canary/"
        target="_blank"
        rel="noreferrer"
        className="btn-press mt-3 block rounded-2xl bg-primary py-3 text-center font-bold text-white"
        style={{ ["--btn-shadow" as string]: "#3d9401" }}
      >
        Chrome Canary 다운로드
      </a>
    </>
  );
}

/**
 * 대문에서 Gemma 4 모델을 직접 내려받아 회화·작문에 쓰게 해주는 카드.
 *
 * 2GB짜리라 자동으로는 절대 받지 않는다 — 버튼을 누르는 것이 곧 동의다.
 * Chrome 내장 Prompt API는 모델을 고를 수 없으므로, 이건 "모델 교체"가 아니라
 * WebGPU에서 도는 별도 엔진을 추가로 켜는 선택지다.
 *
 * 카드의 말투는 `detectAiCapability()`에 따라 달라진다(aiCapability.ts 참고):
 * 내장 AI가 되면 "더 정확해지는 선택", 안 되면 "이걸 받아야 쓸 수 있음"으로 말한다.
 * 내장 AI가 되는 사용자에게 Gemma를 권하는 자리는 **첫 접속 모달이 아니라 이 카드**다.
 */
function GemmaModelCard() {
  const { status, progress, error, download, cancel, remove } = useGemmaModel();
  const engine = useAiEngineStore((s) => s.engine);
  const setEngine = useAiEngineStore((s) => s.setEngine);
  const capability = detectAiCapability();
  /** 내장 AI가 없어 Gemma가 유일한 길인 경우 — 권유가 아니라 안내가 된다. */
  const isOnlyPath = !capability.promptApi;

  if (status === "unsupported") {
    return (
      <div className="rounded-3xl border-4 border-gray-100 bg-white p-4 sm:p-5">
        <p className="text-gray-700">🧠 Gemma 4 직접 실행</p>
        {isOnlyPath ? (
          <ChromeCanaryFallback
            lead="이 브라우저에서는 쓸 수 없습니다 (WebGPU 미지원). 내장 AI도 없어서, 회화·작문을 쓰려면 Chrome Canary가 필요합니다."
          />
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            이 브라우저에서는 쓸 수 없습니다 — WebGPU를 지원하는 브라우저가 필요합니다
            (Chrome·Edge·Safari 26+·Firefox 141+, GPU 메모리 약 1.8GB). 회화·작문은 내장 AI로
            그대로 쓸 수 있어요.
          </p>
        )}
      </div>
    );
  }

  const usingGemma = engine === "gemma4";

  return (
    <div
      className={`rounded-3xl border-4 bg-white p-4 sm:p-5 ${
        isOnlyPath && status !== "installed" ? "border-info" : "border-info/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-gray-700">
            🧠 Gemma 4 직접 실행
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                isOnlyPath ? "bg-info text-white" : "bg-primary/10 text-primary"
              }`}
            >
              {isOnlyPath ? "회화·작문에 필요" : "더 정확한 학습"}
            </span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {isOnlyPath ? (
              <>
                이 브라우저에는 내장 AI가 없지만, {GEMMA_MODEL.label} 모델을 한 번 내려받으면 회화
                연습과 작문 첨삭을 그대로 쓸 수 있어요. 받아두면 저장되어 다음부터는 오프라인으로
                동작합니다.
              </>
            ) : (
              <>
                {GEMMA_MODEL.label} 모델을 직접 내려받아 WebGPU로 돌립니다. 내장 AI보다 큰
                모델이라 회화 응답과 작문 첨삭이 더 자연스럽고 정확해져요. 지금처럼 내장 AI로 계속
                쓰셔도 됩니다.
              </>
            )}
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
          {capability.isMobile && (
            <p className="mt-2 rounded-2xl bg-warning/10 p-2 text-xs text-gray-600">
              ⚠️ {MOBILE_DOWNLOAD_WARNING}
            </p>
          )}
          {status === "error" && error && (
            <>
              <p className="animate-shake mt-2 rounded-2xl bg-danger/10 p-2 text-xs text-danger">
                {error}
              </p>
              {/* 받기에 실패했고 내장 AI도 없으면 더 권할 것이 없다 — 여기가 최후의 보루다. */}
              {isOnlyPath && (
                <ChromeCanaryFallback lead="계속 실패한다면 Chrome Canary의 내장 AI로도 회화·작문을 쓸 수 있어요." />
              )}
            </>
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
          {/* 내장 AI가 없으면 고를 것이 없다 — 누르면 아무것도 안 되는 버튼을 두지 않는다. */}
          {!isOnlyPath && (
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
          )}
          <div className={`flex items-center justify-between gap-2 ${isOnlyPath ? "" : "mt-2"}`}>
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
