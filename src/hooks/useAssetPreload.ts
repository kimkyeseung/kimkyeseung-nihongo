import { useEffect, useState } from "react";
import {
  ASSET_STEPS,
  preloadAssets,
  progressRatio,
  type AssetStatuses,
} from "../lib/preloadAssets";

export interface AssetPreloadState {
  statuses: AssetStatuses;
  /** 0~1 */
  ratio: number;
  /** 지금 받고 있는 항목의 라벨 (없으면 null) */
  currentLabel: string | null;
  /** 전부(성공이든 실패든) 끝났는지 */
  finished: boolean;
  /** 실패한 항목이 하나라도 있는지 */
  hasError: boolean;
}

const EMPTY_STATUSES: AssetStatuses = {};

/** 마운트되면 큰 정적 애셋을 순서대로 미리 받으면서 진행 상황을 반환한다. */
export function useAssetPreload(): AssetPreloadState {
  const [statuses, setStatuses] = useState<AssetStatuses>(EMPTY_STATUSES);

  useEffect(() => {
    let alive = true;
    // 이미 받아둔 항목은 preloadAssets 안에서 건너뛰므로, 대문에 다시 들어오면 즉시 100%가 된다.
    void preloadAssets((next) => {
      if (alive) setStatuses(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const currentStep = ASSET_STEPS.find((s) => statuses[s.id] === "loading");
  const finished =
    ASSET_STEPS.length > 0 &&
    ASSET_STEPS.every((s) => statuses[s.id] === "done" || statuses[s.id] === "error");

  return {
    statuses,
    ratio: progressRatio(statuses),
    currentLabel: currentStep?.label ?? null,
    finished,
    hasError: ASSET_STEPS.some((s) => statuses[s.id] === "error"),
  };
}
