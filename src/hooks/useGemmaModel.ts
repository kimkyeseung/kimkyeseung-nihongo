import { useCallback, useEffect, useRef, useState } from "react";
import { unloadGemmaEngine } from "../lib/gemmaEngine";
import {
  deleteCachedModel,
  downloadModel,
  getCachedModelFile,
  isOpfsSupported,
  isWebGpuSupported,
  type DownloadProgress,
} from "../lib/gemmaModel";
import { useAiEngineStore } from "../stores/aiEngineStore";

export type GemmaModelStatus =
  /** WebGPU/OPFS가 없어서 이 기능 자체를 쓸 수 없음 */
  | "unsupported"
  /** OPFS에 받아둔 게 있는지 확인 중 */
  | "checking"
  /** 아직 안 받음 */
  | "not-installed"
  | "downloading"
  | "installed"
  | "error";

export interface GemmaModelState {
  status: GemmaModelStatus;
  progress: DownloadProgress | null;
  error: string | null;
  download: () => void;
  cancel: () => void;
  remove: () => void;
}

/** 대문의 Gemma 4 카드가 쓰는 훅. 모델 파일의 설치 상태와 다운로드를 관리한다. */
export function useGemmaModel(): GemmaModelState {
  // 지원 여부는 마운트 시점에 동기적으로 알 수 있다 (useLanguageModel과 같은 패턴).
  const [status, setStatus] = useState<GemmaModelStatus>(() =>
    isWebGpuSupported() && isOpfsSupported() ? "checking" : "unsupported"
  );
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 마운트 시 한 번만 OPFS를 확인한다. status를 참조하지 않으므로 의존성 배열이 비어도
  // 경고가 나지 않는다 (지원 여부는 위 lazy initializer와 같은 함수로 다시 판단한다).
  useEffect(() => {
    if (!isWebGpuSupported() || !isOpfsSupported()) return;
    let alive = true;
    getCachedModelFile()
      .then((file) => {
        if (alive) setStatus(file ? "installed" : "not-installed");
      })
      .catch(() => {
        if (alive) setStatus("not-installed");
      });
    return () => {
      alive = false;
    };
  }, []);

  // 탭을 닫거나 페이지를 떠나면 진행 중이던 다운로드를 정리한다.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const download = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress(null);
    setStatus("downloading");

    downloadModel(setProgress, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setStatus("installed");
        setProgress(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) {
          // 사용자가 직접 취소한 경우는 에러가 아니다.
          setStatus("not-installed");
          setProgress(null);
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("not-installed");
    setProgress(null);
  }, []);

  const remove = useCallback(() => {
    void (async () => {
      // 파일만 지우면 이미 GPU에 올라가 있는 엔진은 그대로 남아서, 카드에는 "모델 없음"이라고
      // 뜨는데 회화는 계속 되는 엇갈린 상태가 된다. 엔진을 먼저 내리고 선택도 되돌린다.
      await unloadGemmaEngine();
      if (useAiEngineStore.getState().engine === "gemma4") {
        useAiEngineStore.getState().setEngine("prompt-api");
      }
      await deleteCachedModel();
      setStatus("not-installed");
      setProgress(null);
      setError(null);
    })();
  }, []);

  return { status, progress, error, download, cancel, remove };
}
