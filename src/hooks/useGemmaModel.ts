import { useEffect } from "react";
import {
  cancelGemmaDownload,
  discardGemmaPartial,
  ensureGemmaModelChecked,
  removeGemmaModel,
  startGemmaDownload,
} from "../lib/gemmaDownloadController";
import { useGemmaDownloadStore, type GemmaDownloadState } from "../stores/gemmaDownloadStore";

export type { GemmaModelStatus } from "../stores/gemmaDownloadStore";

export interface GemmaModelState extends GemmaDownloadState {
  download: () => void;
  cancel: () => void;
  remove: () => void;
  /** 받다 만 조각을 버리고 처음부터 받게 한다 */
  discardPartial: () => void;
}

/**
 * 대문의 Gemma 4 카드가 쓰는 훅.
 *
 * **다운로드 자체는 여기 없다** — `gemmaDownloadController.ts`(모듈 싱글턴)가 들고 있고 이
 * 훅은 store를 구독해 넘겨주기만 한다. 예전처럼 훅이 다운로드를 소유하면 카드가 언마운트될
 * 때(=다른 페이지로 이동할 때) 2GB 다운로드가 통째로 취소된다.
 */
export function useGemmaModel(): GemmaModelState {
  const state = useGemmaDownloadStore();

  // 받아둔 모델이 있는지 확인은 최초 1회만 실제로 일어난다(컨트롤러가 막는다).
  useEffect(() => {
    ensureGemmaModelChecked();
  }, []);

  return {
    ...state,
    download: startGemmaDownload,
    cancel: cancelGemmaDownload,
    remove: removeGemmaModel,
    discardPartial: discardGemmaPartial,
  };
}
