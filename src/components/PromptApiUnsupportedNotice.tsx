import { Link } from "react-router-dom";
import ChromeLink from "./ChromeLink";

function PromptApiUnsupportedNotice({ feature }: { feature: string }) {
  return (
    <div className="m-4 rounded-2xl bg-warning/10 p-5 text-sm text-gray-700">
      <p className="font-bold text-warning">
        이 브라우저는 온디바이스 AI(Prompt API)를 지원하지 않습니다.
      </p>
      <p className="mt-2">{feature} 기능을 쓰려면 다음이 필요합니다:</p>
      <ul className="mt-1 list-disc pl-5">
        <li>Chrome Canary (또는 Prompt API를 지원하는 최신 Chrome)</li>
        <li>
          <ChromeLink path="flags" />에서 관련 플래그 활성화 후 재시작
        </li>
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
