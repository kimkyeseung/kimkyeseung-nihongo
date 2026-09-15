import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LoadingMascot from "../components/LoadingMascot";
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

function PromptApiDiagnosticsPage() {
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
      <Link to="/gojuon" className="text-info">
        ← 돌아가기
      </Link>

      <h2 className="mt-3 text-xl text-primary">🩺 온디바이스 AI 자가진단</h2>
      <p className="mt-1 text-sm text-gray-400">
        회화·작문·단어 예문 생성이 안 될 때, 브라우저·버전·설정을 순서대로 확인합니다.
      </p>

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
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{step.detail}</p>
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
              <span className="whitespace-pre-wrap text-gray-600">{trial.detail}</span>
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
        <p className="font-bold text-gray-600">참고: 설정 가이드</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Chrome Canary 등 진짜 Chrome을 최신 버전으로 사용하세요.</li>
          <li>
            <code className="rounded bg-white px-1">chrome://flags/#optimization-guide-on-device-model</code>을{" "}
            <b>Enabled BypassPerfRequirement</b>로 설정
          </li>
          <li>
            <code className="rounded bg-white px-1">chrome://flags/#prompt-api-for-gemini-nano</code>을{" "}
            <b>Enabled</b>로 설정
          </li>
          <li>Chrome을 완전히 재시작</li>
          <li>
            <code className="rounded bg-white px-1">chrome://components</code>에서 "Optimization Guide On
            Device Model" 업데이트 확인 (버전이 0.0.0.0이면 아직 다운로드 전)
          </li>
          <li>
            그래도 안 되면 <code className="rounded bg-white px-1">chrome://on-device-internals</code>에서
            상세 상태 확인
          </li>
        </ol>
      </div>
    </div>
  );
}

export default PromptApiDiagnosticsPage;
