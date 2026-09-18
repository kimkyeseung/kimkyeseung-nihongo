import { Link } from "react-router-dom";
import ChromeLink from "./ChromeLink";
import { GEMMA_MODEL, formatBytes } from "../lib/gemmaModel";
import { MOBILE_DOWNLOAD_WARNING, detectAiCapability } from "../lib/aiCapability";

/**
 * 내장 AI(Prompt API)가 없는 브라우저에서 회화/작문/선생님 페이지에 들어왔을 때의 인라인 안내.
 *
 * **Gemma를 쓸 수 있으면 Gemma를 먼저 권한다** — 예전엔 무조건 "Chrome Canary를 받으세요"라고만
 * 해서, WebGPU만 있으면 되는 Gemma 경로를 눈앞에 두고도 Safari·Firefox 사용자를 Chrome으로
 * 떠밀고 있었다. 판단은 aiCapability.ts 한 곳에서만 한다.
 */
function PromptApiUnsupportedNotice({ feature }: { feature: string }) {
  const capability = detectAiCapability();

  if (capability.gemma) {
    return (
      <div className="m-4 rounded-2xl bg-info/10 p-5 text-sm text-gray-700">
        <p className="font-bold text-info">이 브라우저에는 내장 AI가 없어요.</p>
        <p className="mt-2">
          대신 {GEMMA_MODEL.label} 모델({formatBytes(GEMMA_MODEL.bytes)})을 한 번 내려받으면{" "}
          {feature} 기능을 이 브라우저에서 그대로 쓸 수 있어요. 받아두면 저장되어 다음부터는
          오프라인으로 동작합니다.
        </p>
        {capability.isMobile && (
          <p className="mt-2 rounded-2xl bg-warning/10 p-2 text-xs text-gray-600">
            ⚠️ {MOBILE_DOWNLOAD_WARNING}
          </p>
        )}
        <Link
          to="/"
          className="btn-press mt-3 inline-block rounded-2xl bg-info px-4 py-2 text-white"
          style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.2)" }}
        >
          대문에서 모델 받기
        </Link>
        <p className="mt-3 text-gray-400">
          그 동안 오십음도·사전·한자·단어장 등 다른 기능은 그대로 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  // Gemma도 못 쓰는 경우에만 Chrome을 권한다(최후의 보루).
  return (
    <div className="m-4 rounded-2xl bg-warning/10 p-5 text-sm text-gray-700">
      <p className="font-bold text-warning">
        이 브라우저에서는 {feature} 기능을 쓸 수 없습니다.
      </p>
      <p className="mt-2">
        내장 AI(Prompt API)가 없고, 모델을 직접 받아 실행하는 방법도 쓸 수 없습니다(WebGPU
        미지원). 다음 중 하나가 필요합니다:
      </p>
      <ul className="mt-1 list-disc pl-5">
        <li>Chrome Canary (또는 Prompt API를 지원하는 최신 Chrome)</li>
        <li>
          <ChromeLink path="flags" />에서 관련 플래그 활성화 후 재시작
        </li>
        <li>또는 WebGPU를 지원하는 데스크톱 브라우저(Chrome·Edge·Safari 26+·Firefox 141+)</li>
      </ul>
      <p className="mt-2 text-gray-400">
        그 동안 오십음도·사전·한자·단어장 등 다른 기능은 그대로 사용할 수 있습니다.
      </p>
      <Link to="/diagnostics" className="mt-3 inline-block text-info">
        🩺 자가진단 페이지에서 원인 자세히 확인하기 →
      </Link>
    </div>
  );
}

export default PromptApiUnsupportedNotice;
