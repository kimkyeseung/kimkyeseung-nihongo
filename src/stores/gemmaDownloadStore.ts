import { create } from "zustand";
import { isOpfsSupported, isWebGpuSupported, type DownloadProgress } from "../lib/gemmaModel";

export type GemmaModelStatus =
  /** WebGPU/OPFS가 없어서 이 기능 자체를 쓸 수 없음 */
  | "unsupported"
  /** OPFS에 받아둔 게 있는지 확인 중 */
  | "checking"
  /** 아직 안 받음 (받다 만 조각은 있을 수 있다 — partialBytes 참고) */
  | "not-installed"
  | "downloading"
  | "installed"
  | "error";

export interface GemmaDownloadState {
  status: GemmaModelStatus;
  progress: DownloadProgress | null;
  error: string | null;
  /** 받다 만 조각의 크기(바이트). 0이면 처음부터 받아야 한다. */
  partialBytes: number;
  /** 끊긴 뒤 자동으로 이어받기를 기다리는 중인지 (안내 문구용) */
  autoResuming: boolean;
}

/**
 * Gemma 모델 다운로드 상태.
 *
 * **왜 컴포넌트가 아니라 store인가 (실제로 겪은 문제)**: 예전에는 `useGemmaModel` 훅이
 * 다운로드를 직접 들고 있었는데, 그 훅을 쓰는 `GemmaModelCard`가 대문에만 있다 보니
 * **다른 페이지로 옮기는 순간 카드가 언마운트되면서 2GB 다운로드가 취소**됐다.
 * 회화 세션을 `ConversationSessionController`로 Layout에 올려 탭 이동에도 스트리밍이
 * 안 끊기게 한 것과 같은 문제이고, 여기서는 한 발 더 나가 **React 밖**으로 뺐다 —
 * 대문(`/`)은 Layout 바깥에 있어서 Layout 상주 컨트롤러로도 덮이지 않기 때문이다.
 * 실제 로직은 `src/lib/gemmaDownloadController.ts`(모듈 싱글턴)에 있고, 화면은 이 store를
 * 구독하기만 한다.
 *
 * persist하지 않는다 — 새로고침하면 어차피 `fetch`가 죽는다. 받아둔 조각은 OPFS에 남아 있고
 * 다음 진입에서 `ensureGemmaModelChecked()`가 다시 집어간다.
 */
export const useGemmaDownloadStore = create<GemmaDownloadState>(() => ({
  // 지원 여부는 동기적으로 알 수 있다 — "확인 중"을 한 번 보여줬다가 "미지원"으로 뒤집지 않는다.
  status: isWebGpuSupported() && isOpfsSupported() ? "checking" : "unsupported",
  progress: null,
  error: null,
  partialBytes: 0,
  autoResuming: false,
}));
