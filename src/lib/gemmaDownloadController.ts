import { useAiEngineStore } from "../stores/aiEngineStore";
import { useGemmaDownloadStore } from "../stores/gemmaDownloadStore";
import { unloadGemmaEngine } from "./gemmaEngine";
import {
  deleteCachedModel,
  describeDownloadFailure,
  discardPartialDownload,
  downloadModel,
  getCachedModelFile,
  getPartialBytes,
  isOpfsSupported,
  isWebGpuSupported,
  type DownloadProgress,
} from "./gemmaModel";
import { isPromptApiSupported } from "./languageModel";
import { holdScreenAwake } from "./screenWakeLock";

/**
 * Gemma 모델 다운로드를 **앱 전체에서 하나만** 돌리는 모듈 싱글턴.
 *
 * 컴포넌트가 아니라 모듈인 이유는 `gemmaDownloadStore.ts`에 적어뒀다 — 요약하면, 다운로드를
 * 화면이 소유하면 화면을 옮길 때 2GB가 취소된다. 엔진을 모듈 레벨 Promise 하나로 두는 것
 * (`gemmaEngine.ts`)과 같은 이유다.
 *
 * 화면(GemmaModelCard, GemmaDownloadBar)은 store를 구독하고 여기 함수를 부르기만 한다.
 */

/**
 * 자동 이어받기 횟수 상한. "직전 시도가 실제로 진척을 냈을 때만" 이어받으므로 보통은 여기에
 * 닿지 않는다 — 네트워크가 완전히 끊긴 상황에서 무한히 재시도하지 않게 두는 안전장치다.
 */
const MAX_AUTO_RESUMES = 5;

/**
 * 진행률을 store에 반영하는 최소 간격(ms).
 *
 * `downloadModel`은 응답 스트림의 **청크마다** 진행률을 준다(초당 수백 번). 그대로 store에
 * 흘리면 진행률 띠가 모든 페이지에 떠 있는 만큼 학습 화면 전체가 그 빈도로 리렌더된다.
 * 눈으로 읽는 숫자라 4fps면 충분하다. 마지막 한 번은 간격과 무관하게 항상 반영한다.
 */
const PROGRESS_INTERVAL_MS = 250;

const set = useGemmaDownloadStore.setState;

let controller: AbortController | null = null;
let inFlight = false;
let autoResumeCount = 0;
let checked = false;
let releaseWakeLock: (() => void) | null = null;

/**
 * 내장 AI가 없는 브라우저에서 모델을 받았다면 엔진 선택을 Gemma로 옮겨준다.
 *
 * 엔진 기본값은 "prompt-api"인데(aiEngineStore), 내장 AI가 없는 브라우저에서는 그게 동작하지
 * 않는다. 2GB를 받아놓고도 회화에 들어가면 "지원하지 않는 브라우저"라는 안내를 보게 되는
 * 함정이 있어서, 고를 것이 하나뿐인 경우엔 대신 골라준다.
 */
function selectGemmaIfOnlyOption(): void {
  if (isPromptApiSupported()) return;
  const { engine, setEngine } = useAiEngineStore.getState();
  if (engine !== "gemma4") setEngine("gemma4");
}

/** 받는 동안에만 화면을 붙잡는다. 상태가 바뀔 때마다 불러서 맞춘다(여러 번 불러도 안전). */
function syncWakeLock(): void {
  const { status, autoResuming } = useGemmaDownloadStore.getState();
  const wanted = status === "downloading" || autoResuming;
  if (wanted && !releaseWakeLock) {
    releaseWakeLock = holdScreenAwake();
  } else if (!wanted && releaseWakeLock) {
    releaseWakeLock();
    releaseWakeLock = null;
  }
}
useGemmaDownloadStore.subscribe(syncWakeLock);

/**
 * 받아둔 모델이 있는지 한 번만 확인한다. 여러 화면이 불러도 실제 확인은 한 번뿐이다.
 * (다운로드가 도는 중에 다시 불러도 상태를 덮어쓰지 않는다.)
 */
export function ensureGemmaModelChecked(): void {
  if (checked) return;
  checked = true;
  if (!isWebGpuSupported() || !isOpfsSupported()) {
    set({ status: "unsupported" });
    return;
  }

  void (async () => {
    try {
      const file = await getCachedModelFile();
      if (file) {
        set({ status: "installed" });
        selectGemmaIfOnlyOption();
        return;
      }
      // 받다 만 조각이 있으면 "이어받기"로 안내해야 한다.
      set({ status: "not-installed", partialBytes: await getPartialBytes() });
    } catch {
      set({ status: "not-installed" });
    }
  })();
}

function run(auto: boolean): void {
  // 이미 받는 중이면 무시한다. StrictMode에서 effect가 두 번 실행되거나 버튼이 두 번 눌려도
  // 같은 파일에 두 개의 스트림이 달라붙지 않게 하는 가드다.
  if (inFlight) return;
  inFlight = true;

  const ctrl = new AbortController();
  controller = ctrl;
  if (!auto) autoResumeCount = 0;
  set({ status: "downloading", progress: null, error: null, autoResuming: false });

  void (async () => {
    /** try/finally가 끝난 **뒤에** 이어받아야 한다 — 아래 주석 참고. */
    let resumeAfterwards = false;

    // 이번 시도가 실제로 진척을 냈는지 판단할 기준점.
    const startedFrom = await getPartialBytes();
    set({ partialBytes: startedFrom });

    let lastPublishedAt = 0;
    const publishProgress = (progress: DownloadProgress) => {
      const now = performance.now();
      const isLast = progress.receivedBytes >= progress.totalBytes;
      if (!isLast && now - lastPublishedAt < PROGRESS_INTERVAL_MS) return;
      lastPublishedAt = now;
      set({ progress });
    };

    try {
      await downloadModel(publishProgress, ctrl.signal);
      if (ctrl.signal.aborted) return;
      set({ status: "installed", progress: null, partialBytes: 0, error: null });
      selectGemmaIfOnlyOption();
    } catch (error: unknown) {
      // 사용자가 직접 취소한 경우는 에러가 아니다. 화면 상태는 cancelGemmaDownload()가 이미
      // 정리했고, 여기서 더 건드리면 그 사이 새로 시작한 다운로드의 진행률을 지워버린다.
      if (ctrl.signal.aborted) return;

      const kept = await getPartialBytes();
      const failure = describeDownloadFailure(error, kept);

      // 화면이 꺼졌거나 다른 앱으로 갔다가 돌아온 경우다. 직전 시도가 실제로 진척을 냈을
      // 때만 자동으로 이어받는다 — 아예 끊긴 상태에서 같은 실패를 반복하지 않기 위해서다.
      const madeProgress = kept > startedFrom;
      resumeAfterwards = failure.resumable && madeProgress && autoResumeCount < MAX_AUTO_RESUMES;
      if (resumeAfterwards) autoResumeCount += 1;

      set({
        status: "error",
        progress: null,
        partialBytes: kept,
        error: failure.message,
        autoResuming: resumeAfterwards,
      });
    } finally {
      // 취소 직후 새 다운로드가 시작됐다면 그 쪽의 깃발이다 — 내려서는 안 된다
      // (취소 시점에 cancelGemmaDownload()가 이미 내려뒀다).
      if (controller === ctrl) {
        inFlight = false;
        controller = null;
      }
    }

    // **반드시 finally 밖에서 부른다.** catch 안에서 바로 이어받으면 아직 inFlight가 true라
    // run()이 그대로 무시당하고 이어받기가 조용히 사라진다.
    if (resumeAfterwards) scheduleAutoResume();
  })();
}

/**
 * 자동 이어받기.
 *
 * 끊긴 사실은 대개 **탭이 다시 보이는 순간** 알게 된다(얼어 있던 fetch의 promise가 그때
 * 거절된다). 그래서 "다음 visibilitychange를 기다린다"로만 짜면 이미 지나간 뒤라 영영 안
 * 걸린다 — 지금 보이는 상태면 그 자리에서 바로 이어받는다.
 */
function scheduleAutoResume(): void {
  if (document.visibilityState === "visible") {
    resumeNow();
    return;
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function onVisibilityChange(): void {
  if (document.visibilityState !== "visible") return;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  resumeNow();
}

function resumeNow(): void {
  // 기다리는 사이에 사용자가 취소했을 수 있다.
  if (!useGemmaDownloadStore.getState().autoResuming) return;
  set({ autoResuming: false });
  run(true);
}

/** 대문 카드의 "모델 내려받기" / "이어받기" 버튼. */
export function startGemmaDownload(): void {
  run(false);
}

/** 받기를 멈춘다. 받아둔 조각은 남긴다 — 데이터 요금제에서 멈췄다가 와이파이에서 이어받도록. */
export function cancelGemmaDownload(): void {
  controller?.abort();
  controller = null;
  inFlight = false;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  set({ status: "not-installed", progress: null, autoResuming: false });
  void getPartialBytes().then((partialBytes) => set({ partialBytes }));
}

/** 받다 만 조각을 버리고 처음부터 받게 한다. */
export function discardGemmaPartial(): void {
  cancelGemmaDownload();
  void (async () => {
    await discardPartialDownload();
    set({ status: "not-installed", progress: null, partialBytes: 0, error: null });
  })();
}

/** 받아둔 모델을 지운다. */
export function removeGemmaModel(): void {
  cancelGemmaDownload();
  void (async () => {
    // 파일만 지우면 이미 GPU에 올라가 있는 엔진은 그대로 남아서, 카드에는 "모델 없음"이라고
    // 뜨는데 회화는 계속 되는 엇갈린 상태가 된다. 엔진을 먼저 내리고 선택도 되돌린다.
    await unloadGemmaEngine();
    if (useAiEngineStore.getState().engine === "gemma4") {
      useAiEngineStore.getState().setEngine("prompt-api");
    }
    await deleteCachedModel();
    set({ status: "not-installed", progress: null, partialBytes: 0, error: null });
  })();
}
