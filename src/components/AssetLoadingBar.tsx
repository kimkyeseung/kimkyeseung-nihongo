interface Props {
  /** 0~1 */
  ratio: number;
  finished: boolean;
  hasError: boolean;
}

/**
 * 큰 정적 데이터(사전·한자·획순)를 미리 받는 동안의 얇은 띠. 끝나면 사라진다.
 *
 * 예전엔 항목별 체크리스트("한자 획순 데이터 1.9MB")가 시작 버튼 바로 위를 차지해, 처음 온 사람이 첫 화면에서 가장 크게 보는
 * 것이 다운로드 현황이었다. 받는 동안에도 시작할 수 있으니 알려 주기만 하면 된다. 실패는 그 페이지에서 다시 받으므로 한 줄이면 된다.
 */
function AssetLoadingBar({ ratio, finished, hasError }: Props) {
  if (hasError && finished) {
    return <p className="text-center text-xs text-gray-400">⚠️ 일부 데이터는 해당 페이지에 들어갈 때 다시 받아요.</p>;
  }
  if (finished) return null;

  const percent = Math.round(ratio * 100);
  return (
    <div role="status" aria-label={`학습 데이터 준비 중 ${percent}%`} className="flex items-center gap-2 text-xs text-gray-400">
      <span className="shrink-0">학습 데이터 준비 중</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200">
        <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </span>
      <span className="shrink-0 tabular-nums">{percent}%</span>
    </div>
  );
}

export default AssetLoadingBar;
