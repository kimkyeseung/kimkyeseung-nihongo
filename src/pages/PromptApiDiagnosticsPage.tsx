import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ChromeLink from "../components/ChromeLink";
import LoadingMascot from "../components/LoadingMascot";
import { renderWithChromeLinks } from "../lib/chromeLinks";
import { GEMMA_MODEL, formatBytes } from "../lib/gemmaModel";
import { builtinUnavailableReason } from "../lib/aiCapability";
import { useAiCapability } from "../hooks/useAiCapability";
import {
  runLanguageModelDiagnostics,
  runSessionCreationTrial,
  type DiagnosticsResult,
  type SessionTrialResult,
} from "../lib/languageModelDiagnostics";

const STATUS_BADGE: Record<string, { emoji: string; className: string }> = {
  pass: { emoji: "✅", className: "text-primary" },
  fail: { emoji: "❌", className: "text-danger" },
  warn: { emoji: "⚠️", className: "text-warning" },
  unknown: { emoji: "➖", className: "text-gray-400" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.unknown;
  return <span className={badge.className}>{badge.emoji}</span>;
}

/**
 * 아래 단계별 진단은 **Chrome 내장 AI(Prompt API)만** 본다. 그런데 이 앱에는 Gemma 4라는 두 번째
 * 길이 있어서, 그것만 보여주면 Safari·Whale 사용자가 ❌만 잔뜩 보고 "이 브라우저는 안 되는구나"
 * 하고 돌아가게 된다 — 정작 Gemma로는 쓸 수 있는데도. 그래서 결론을 맨 위에 먼저 놓는다.
 */
function CapabilitySummary() {
  const capability = useAiCapability();

  if (!capability) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-gray-100 bg-white p-4 text-sm text-gray-400">
        이 브라우저에서 쓸 수 있는 방법을 확인하는 중...
      </div>
    );
  }

  if (capability.path === "builtin-ready") {
    return (
      <div className="mt-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-sm text-gray-700">
        <p className="font-bold text-primary">✅ 이 브라우저에서 AI 기능을 쓸 수 있어요.</p>
        <p className="mt-1">
          Chrome 내장 AI를 쓸 수 있는 상태입니다. 더 자연스러운 답변을 원하시면 대문에서{" "}
          {GEMMA_MODEL.label}({formatBytes(GEMMA_MODEL.bytes)})을 받아 바꿔 쓸 수도 있어요.
        </p>
      </div>
    );
  }

  if (capability.path === "gemma-required") {
    return (
      <div className="mt-4 rounded-2xl border-2 border-info/30 bg-info/5 p-4 text-sm text-gray-700">
        <p className="font-bold text-info">🧠 내장 AI는 못 쓰지만, 방법이 있어요.</p>
        <p className="mt-1">{builtinUnavailableReason(capability)}</p>
        <p className="mt-1">
          대신 {GEMMA_MODEL.label} 모델({formatBytes(GEMMA_MODEL.bytes)})을 한 번 내려받으면 회화·작문·선생님
          기능을 이 브라우저에서 그대로 쓸 수 있습니다.
        </p>
        <Link
          to="/"
          className="btn-press mt-3 inline-block rounded-2xl bg-info px-4 py-2 text-white"
          style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.2)" }}
        >
          대문에서 모델 받기
        </Link>
        <p className="mt-3 text-gray-400">
          아래 단계별 확인은 Chrome 내장 AI에 대한 것이라, 이 브라우저에서는 ❌가 나오는 게
          정상입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-warning/30 bg-warning/5 p-4 text-sm text-gray-700">
      <p className="font-bold text-warning">⚠️ 이 브라우저에서는 AI 기능을 쓸 수 없어요.</p>
      <p className="mt-1">{builtinUnavailableReason(capability)}</p>
      <p className="mt-1">
        모델을 직접 받아 실행하는 방법(WebGPU)도 쓸 수 없습니다. Chrome Canary를 쓰거나, WebGPU를
        지원하는 데스크톱 브라우저(Chrome·Edge·Safari 26+·Firefox 141+)에서 열어보세요.
      </p>
      <a
        href="https://www.google.com/chrome/canary/"
        target="_blank"
        rel="noreferrer"
        className="btn-press mt-3 inline-block rounded-2xl bg-primary px-4 py-2 font-bold text-white"
        style={{ ["--btn-shadow" as string]: "#3d9401" }}
      >
        Chrome Canary 다운로드
      </a>
    </div>
  );
}

function PromptApiDiagnosticsPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [trial, setTrial] = useState<SessionTrialResult | null>(null);
  const [isTrialRunning, setIsTrialRunning] = useState(false);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    setTrial(null);
    const diagnostics = await runLanguageModelDiagnostics();
    setResult(diagnostics);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  async function handleTrial() {
    setIsTrialRunning(true);
    setTrial(await runSessionCreationTrial());
    setIsTrialRunning(false);
  }

  const apiExists = result?.steps.some((s) => s.id === "api" && s.status === "pass") ?? false;

  return (
    <div className="p-4 sm:p-6">
      {/* 어디서 들어왔든 오십음도로 보내버리지 않는다(예전엔 /gojuon 하드코딩이었다). */}
      <button onClick={() => navigate(-1)} className="text-info">
        ← 돌아가기
      </button>

      <h2 className="mt-3 text-xl text-primary">🩺 온디바이스 AI 자가진단</h2>
      <p className="mt-1 text-sm text-gray-400">
        회화·작문 첨삭·선생님 답변·단어 예문 생성이 안 될 때, 어떤 방법을 쓸 수 있는지 확인합니다.
      </p>

      <CapabilitySummary />

      <h3 className="mt-6 text-lg text-gray-700">Chrome 내장 AI 단계별 확인</h3>

      {isChecking && (
        <div className="mt-6">
          <LoadingMascot label="확인하는 중..." />
        </div>
      )}

      {result && (
        <ul className="mt-6 flex flex-col gap-3">
          {result.steps.map((step) => (
            <li key={step.id} className="rounded-2xl border-2 border-gray-100 bg-white p-4">
              <p className="font-bold">
                <StatusBadge status={step.status} /> {step.title}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                {renderWithChromeLinks(step.detail)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!isChecking && apiExists && (
        <div className="mt-4 rounded-2xl border-2 border-gray-100 bg-white p-4">
          <p className="font-bold">5. 실제 세션 생성 테스트</p>
          <p className="mt-1 text-sm text-gray-500">
            앞의 확인만으로는 못 잡아내는 오류(예: 실행 게이팅 플래그 비활성화)를 잡아냅니다. 모델을
            아직 안 받았다면 이 테스트에서 다운로드가 시작될 수 있습니다(수 GB).
          </p>
          <button
            onClick={handleTrial}
            disabled={isTrialRunning}
            className="btn-press mt-3 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:bg-gray-200"
            style={{ "--btn-shadow": "#3d9401" } as React.CSSProperties}
          >
            {isTrialRunning ? "테스트 중..." : "지금 테스트하기"}
          </button>

          {trial && (
            <p className="mt-3 text-sm">
              <StatusBadge status={trial.status} />{" "}
              <span className="whitespace-pre-wrap text-gray-600">
                {renderWithChromeLinks(trial.detail)}
              </span>
            </p>
          )}
        </div>
      )}

      {!isChecking && (
        <button onClick={runChecks} className="btn-press mt-4 rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
          ↻ 다시 진단하기
        </button>
      )}

      <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">
        <p className="font-bold text-gray-600">참고: Chrome 내장 AI 설정 가이드</p>
        {result && !result.browser.isGenuineChrome && (
          <p className="mt-2 rounded-2xl bg-white p-2 text-xs">
            {result.browser.name}에서는 이 설정을 해도 내장 AI를 쓸 수 없습니다 — 켤 플래그 자체가
            없습니다. 위의 Gemma 4 방법을 쓰거나 진짜 Chrome에서 아래를 따라 하세요.
          </p>
        )}
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Chrome Canary 등 진짜 Chrome을 최신 버전으로 사용하세요.</li>
          <li>
            <ChromeLink path="flags/#optimization-guide-on-device-model" />을{" "}
            <b>Enabled BypassPerfRequirement</b>로 설정
          </li>
          <li>
            <ChromeLink path="flags/#prompt-api-for-gemini-nano" />을 <b>Enabled</b>로 설정
          </li>
          <li>Chrome을 완전히 재시작</li>
          <li>
            <ChromeLink path="components" />에서 "Optimization Guide On Device Model" 업데이트 확인
            (버전이 0.0.0.0이면 아직 다운로드 전)
          </li>
          <li>
            그래도 안 되면 <ChromeLink path="on-device-internals" />에서 상세 상태 확인
          </li>
        </ol>
      </div>
    </div>
  );
}

export default PromptApiDiagnosticsPage;
