import { create } from "zustand";
import { isKanaModelAvailable } from "../lib/kanaModel";

export type KanaModelStatus =
  /** 주소가 없거나(아직 올리기 전) OPFS가 없어 쓸 수 없음 */
  | "unsupported"
  | "checking"
  | "not-installed"
  | "downloading"
  | "installed"
  | "error";

/**
 * 발음 판정 모델 다운로드 상태. Gemma(`gemmaDownloadStore`)와 같은 이유로 **React 밖**의 모듈
 * (`kanaModelController.ts`)이 다운로드를 들고 있고 화면은 이걸 구독한다 — 게임 시트를 닫거나 탭을 옮겨도
 * 받기가 끊기지 않는다. persist하지 않는다(받은 파일은 OPFS에 있다).
 */
export const useKanaModelStore = create<{
  status: KanaModelStatus;
  receivedBytes: number;
  error: string | null;
}>(() => ({
  status: isKanaModelAvailable() ? "checking" : "unsupported",
  receivedBytes: 0,
  error: null,
}));
