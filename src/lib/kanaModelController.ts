import { useKanaModelStore } from "../stores/kanaModelStore";
import { formatBytes, getStorageHeadroom, requestPersistentStorage } from "./gemmaModel";
import { deleteKanaModel, downloadKanaModel, getCachedKanaModel, KANA_MODEL } from "./kanaModel";
import { holdScreenAwake } from "./screenWakeLock";

/**
 * 발음 판정 모델 다운로드를 앱 전체에서 하나만 돌리는 모듈 싱글턴(`gemmaDownloadController.ts`와 같은 구조).
 * 진행률은 250ms 간격으로만 store에 넣는다 — 청크마다 넣으면 받는 동안 화면이 초당 수백 번 다시 그려진다.
 */

const PROGRESS_INTERVAL_MS = 250;
const set = useKanaModelStore.setState;
let controller: AbortController | null = null;
let checked = false;

export function ensureKanaModelChecked(): void {
  if (checked || useKanaModelStore.getState().status === "unsupported") return;
  checked = true;
  void getCachedKanaModel().then((file) => {
    if (useKanaModelStore.getState().status === "checking") set({ status: file ? "installed" : "not-installed" });
  });
}

export function startKanaModelDownload(): void {
  const { status } = useKanaModelStore.getState();
  if (status === "downloading" || status === "installed" || status === "unsupported") return;
  void run();
}

async function run() {
  set({ status: "downloading", receivedBytes: 0, error: null });
  const headroom = await getStorageHeadroom();
  if (headroom !== null && headroom < KANA_MODEL.bytes * 1.2) {
    set({
      status: "error",
      error: `저장 공간이 부족해요 (남은 공간 ${formatBytes(headroom)}, 필요 ${formatBytes(KANA_MODEL.bytes)})`,
    });
    return;
  }
  void requestPersistentStorage();
  controller = new AbortController();
  const release = holdScreenAwake();
  let last = 0;
  try {
    await downloadKanaModel((received) => {
      const now = performance.now();
      if (now - last >= PROGRESS_INTERVAL_MS || received === KANA_MODEL.bytes) {
        last = now;
        set({ receivedBytes: received });
      }
    }, controller.signal);
    set({ status: "installed", receivedBytes: KANA_MODEL.bytes });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    set({
      status: aborted ? "not-installed" : "error",
      error: aborted
        ? null
        : error instanceof TypeError
          ? "내려받는 중에 연결이 끊겼어요. 다시 눌러 처음부터 받아주세요."
          : (error as Error).message,
    });
  } finally {
    controller = null;
    release();
  }
}

export function cancelKanaModelDownload(): void {
  controller?.abort();
}

export function removeKanaModel(): void {
  void deleteKanaModel().then(() => set({ status: "not-installed", receivedBytes: 0, error: null }));
}
