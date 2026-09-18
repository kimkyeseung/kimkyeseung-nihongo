import { Link } from "react-router-dom";
import { useGemmaDownloadStore } from "../stores/gemmaDownloadStore";
import { GEMMA_MODEL, formatBytes, formatEta } from "../lib/gemmaModel";
import ProgressBar from "./ProgressBar";

/**
 * 2GB 모델을 받는 동안 **어느 페이지에서나** 보이는 얇은 진행률 띠.
 *
 * 다운로드는 대문의 `GemmaModelCard`에서 시작하지만 실제 주인은 모듈 싱글턴
 * (`gemmaDownloadController.ts`)이라 페이지를 옮겨도 계속 돈다. 그 사실이 화면에 보이지
 * 않으면 사용자는 다운로드가 취소된 줄 알고 대문으로 돌아가 다시 누른다 — 그래서 띠가 필요하다.
 *
 * Layout에 상주하므로 받는 중이 아닐 때는 **아무것도 그리지 않는다**(헤더 아래 공간을
 * 차지하지 않는다). 대문(`/`)은 Layout 밖이라 여기 안 뜨지만, 거기엔 카드가 이미 있다.
 */
function GemmaDownloadBar() {
  const status = useGemmaDownloadStore((s) => s.status);
  const progress = useGemmaDownloadStore((s) => s.progress);
  const partialBytes = useGemmaDownloadStore((s) => s.partialBytes);
  const autoResuming = useGemmaDownloadStore((s) => s.autoResuming);

  // 자동 이어받기 중에는 status가 잠깐 "error"다. 받는 중으로 취급해야 띠가 깜빡이지 않는다.
  if (status !== "downloading" && !autoResuming) return null;

  // 이어받는 첫 순간에는 progress가 아직 없다. 받아둔 만큼을 기준으로 그려야 진행률이
  // 0으로 떨어졌다 되돌아오지 않는다.
  const receivedBytes = progress?.receivedBytes ?? partialBytes;
  const totalBytes = progress?.totalBytes ?? GEMMA_MODEL.bytes;
  const percent = (receivedBytes / totalBytes) * 100;
  const eta = progress ? formatEta(totalBytes - receivedBytes, progress.bytesPerSecond) : null;

  return (
    <Link
      to="/"
      aria-label="Gemma 4 모델 내려받는 중 — 대문에서 자세히 보기"
      className="flex items-center gap-2 border-b-4 border-info/20 bg-info/5 px-4 py-2 sm:px-6"
    >
      <span className="text-lg leading-none">🧠</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-[11px] sm:text-xs">
          <span className="truncate text-gray-500">
            {autoResuming || !progress
              ? "Gemma 4 모델 이어받는 중..."
              : `Gemma 4 모델 내려받는 중 · ${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}${
                  eta ? ` · ${eta}` : ""
                }`}
          </span>
          <span className="shrink-0 text-info tabular-nums">{Math.round(percent)}%</span>
        </div>
        {/* 높이는 ProgressBar가 정한다 — className으로 h-2를 덮어써도 Tailwind 규칙 순서상
            이기지 못한다(같은 height 유틸리티끼리는 클래스 속성 순서가 아니라 CSS 순서로
            결정된다). 크기를 바꿔야 하면 ProgressBar에 prop을 추가할 것. */}
        <ProgressBar className="mt-1" percent={percent} label="Gemma 4 모델 내려받는 중" />
      </div>
    </Link>
  );
}

export default GemmaDownloadBar;
