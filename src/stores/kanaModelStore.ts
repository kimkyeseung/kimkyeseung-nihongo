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
 * 발음 판정 모델 상태. 받기는 **React 밖**의 모듈(`kanaModelController.ts`)이 앱 시작 뒤 백그라운드에서 하고,
 * 게임은 `installed`인지만 본다(받는 중이라는 사실은 화면에 알리지 않는다). persist하지 않는다(파일은 OPFS에 있다).
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
