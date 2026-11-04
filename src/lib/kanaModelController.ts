import { useKanaModelStore } from "../stores/kanaModelStore";
import { getStorageHeadroom } from "./gemmaModel";
import { downloadKanaModel, getCachedKanaModel, isIosDevice, KANA_MODEL } from "./kanaModel";

/**
 * 발음 판정 모델을 받는 시점.
 *
 * **iOS가 아니면 앱이 뜬 뒤 백그라운드에서 조용히** 받는다(사용자 결정 — 버튼·진행률·안내를 보이지 않는다).
 * Gemma(2GB)의 "버튼이 곧 동의" 규칙의 예외이고, 대신 다음은 지킨다:
 * - 대문 프리로드(사전 등 학습 데이터)와 겹치지 않게 늦게, 브라우저가 한가할 때 시작한다(`AUTO_DELAY_MS`).
 * - **데이터를 아끼는 연결이면 받지 않는다** — 브라우저가 `saveData`(데이터 절약 모드)이거나 모바일 데이터라고
 *   알려 주면 건너뛴다. 사용자 모르게 189MB를 요금제에서 쓰면 안 된다.
 * - 지속 저장 요청(`navigator.storage.persist`)·화면 켜짐 유지는 하지 않는다 — Firefox는 persist에 권한 창을
 *   띄워서 "모르게"가 깨지고, 백그라운드 받기에 화면을 붙잡을 이유가 없다.
 * - 저장 공간이 모자라거나 실패하면 조용히 그만두고 다음 방문 때 다시 해 본다(이어받기 없음 — 처음부터).
 *
 * **iOS는 연결 종류를 알려 주지 않아** 위 조건으로 걸러지지 않는다. 그래서 발음 게임을 처음 열 때 받고, 받는 동안 그 사실과
 * "그만 받기"를 보여 준다(`KanaSpeakingGame`). 그만 받으면 새로고침 전까지 다시 시작하지 않는다.
 *
 * 게임은 모델이 준비됐으면 기기 안 판정, 아니면 브라우저 음성 인식을 쓴다.
 * 외부 요청이므로 `/privacy`에는 적어 둔다(화면에 안 보이는 것과 처리방침에서 빼는 것은 다르다).
 */

const AUTO_DELAY_MS = 8000;
const set = useKanaModelStore.setState;
let checking: Promise<void> | null = null;
let scheduled = false;
/** 받기를 시작했는가 — 확인(await) 사이에 두 번 시작하지 않게. */
let starting = false;
let declined = false;
let abort: AbortController | null = null;

/** 이 기기는 발음 게임을 열 때 받는가(게임이 받는 중 안내를 보여 줄지도 이걸로 정한다). */
export function downloadsOnGameOpen(): boolean {
  return isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
}

export function ensureKanaModelChecked(): Promise<void> {
  if (useKanaModelStore.getState().status === "unsupported") return Promise.resolve();
  checking ??= getCachedKanaModel().then((file) => {
    if (useKanaModelStore.getState().status === "checking") set({ status: file ? "installed" : "not-installed" });
  });
  return checking;
}

type NetworkInformationLike = { saveData?: boolean; type?: string };

/** 데이터를 아껴야 하는 연결인지(알 수 있을 때만). */
function onMeteredConnection(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return conn?.saveData === true || conn?.type === "cellular";
}

/** 앱 시작 시 한 번 부른다(App.tsx). 여러 번 불러도 한 번만 예약한다. iOS는 예약하지 않는다. */
export function scheduleKanaModelAutoDownload(): void {
  if (scheduled || downloadsOnGameOpen() || useKanaModelStore.getState().status === "unsupported") return;
  scheduled = true;
  window.setTimeout(() => {
    const go = () => void startDownload();
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 10_000 });
    else go();
  }, AUTO_DELAY_MS);
}

/** 발음 게임을 열었을 때 부른다. iOS에서만 받기를 시작한다. */
export function startKanaModelDownloadOnGameOpen(): void {
  if (downloadsOnGameOpen() && !declined) void startDownload();
}

/** 받기를 멈춘다. 받다 만 파일은 `downloadKanaModel`이 지운다. */
export function cancelKanaModelDownload(): void {
  declined = true;
  abort?.abort();
}

async function startDownload() {
  if (starting) return;
  starting = true;
  try {
    await ensureKanaModelChecked();
    if (useKanaModelStore.getState().status !== "not-installed" || onMeteredConnection()) return;
    const headroom = await getStorageHeadroom();
    if (headroom !== null && headroom < KANA_MODEL.bytes * 1.2) return;
    set({ status: "downloading", receivedBytes: 0, error: null });
    abort = new AbortController();
    await downloadKanaModel((receivedBytes) => set({ receivedBytes }), abort.signal);
    set({ status: "installed", receivedBytes: KANA_MODEL.bytes });
  } catch (error) {
    // 조용히 그만둔다 — 다음 방문 때 다시 받는다. 원인은 디버그용으로만 남긴다.
    console.info("[발음 판정 모델] 받기 실패", error);
    set({ status: "not-installed", error: null });
  } finally {
    abort = null;
    starting = false;
  }
}
