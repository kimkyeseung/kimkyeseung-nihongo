import { ASSET_STEPS, type AssetStatuses } from "../lib/preloadAssets";
import ProgressBar from "./ProgressBar";

const STATUS_ICON: Record<string, string> = {
  pending: "⬜",
  loading: "⏳",
  done: "✅",
  error: "⚠️",
};

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

interface Props {
  statuses: AssetStatuses;
  /** 0~1 */
  ratio: number;
  currentLabel: string | null;
  finished: boolean;
  hasError: boolean;
}

/** 큰 정적 데이터(사전·한자·획순)를 미리 받는 동안 보여주는 진행률 바 + 항목 체크리스트. */
function AssetLoadingBar({ statuses, ratio, currentLabel, finished, hasError }: Props) {
  const percent = Math.round(ratio * 100);

  return (
    <div className="rounded-3xl border-4 border-primary/20 bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-gray-500">
          {finished ? "학습 데이터 준비 완료!" : (currentLabel ?? "학습 데이터 준비 중...")}
        </span>
        <span className="text-lg text-primary tabular-nums">{percent}%</span>
      </div>

      <ProgressBar
        className="mt-2"
        percent={percent}
        label="학습 데이터 내려받는 중"
        active={!finished}
      />

      <ul className="mt-3 flex flex-col gap-1.5">
        {ASSET_STEPS.map((step) => {
          const status = statuses[step.id] ?? "pending";
          return (
            <li
              key={step.id}
              className={`flex items-center gap-2 text-sm ${
                status === "done"
                  ? "text-gray-600"
                  : status === "loading"
                    ? "text-primary"
                    : status === "error"
                      ? "text-danger"
                      : "text-gray-300"
              }`}
            >
              <span aria-hidden>{STATUS_ICON[status]}</span>
              <span className="flex-1 truncate">{step.label}</span>
              <span className="text-xs text-gray-300 tabular-nums">{formatMb(step.bytes)}</span>
            </li>
          );
        })}
      </ul>

      {hasError && (
        <p className="mt-3 rounded-2xl bg-danger/10 p-2 text-xs text-danger">
          일부 데이터를 미리 받지 못했어요. 그대로 시작해도 되고, 해당 페이지에 들어갈 때 다시
          받아옵니다.
        </p>
      )}
    </div>
  );
}

export default AssetLoadingBar;
