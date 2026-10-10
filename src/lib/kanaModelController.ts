import { useKanaModelStore } from "../stores/kanaModelStore";
import { getStorageHeadroom } from "./gemmaModel";
import { downloadKanaModel, getCachedKanaModel, KANA_MODEL } from "./kanaModel";

/**
 * 발음 판정 모델을 **앱이 뜬 뒤 백그라운드에서 조용히** 받는다(사용자 결정 — 버튼·진행률·안내를 보이지 않는다).
 * Gemma(2GB)의 "버튼이 곧 동의" 규칙의 예외이고, 대신 다음은 지킨다:
 * - 대문 프리로드(사전 등 학습 데이터)와 겹치지 않게 늦게, 브라우저가 한가할 때 시작한다(`AUTO_DELAY_MS`).
 * - **데이터를 아끼는 연결이면 받지 않는다** — 브라우저가 `saveData`(데이터 절약 모드)이거나 모바일 데이터라고
 *   알려 주면 건너뛴다. 사용자 모르게 189MB를 요금제에서 쓰면 안 된다. (iOS Safari는 연결 종류를 안 알려 줘서 받는다.)
 * - 지속 저장 요청(`navigator.storage.persist`)·화면 켜짐 유지는 하지 않는다 — Firefox는 persist에 권한 창을
 *   띄워서 "모르게"가 깨지고, 백그라운드 받기에 화면을 붙잡을 이유가 없다.
 * - 저장 공간이 모자라거나 실패하면 조용히 그만두고 다음 방문 때 다시 해 본다(이어받기 없음 — 처음부터).
 * 게임은 모델이 준비됐으면 기기 안 판정, 아니면 브라우저 음성 인식을 쓴다 — 받는 중인지 화면에 알리지 않는다.
 * 외부 요청이므로 `/privacy`에는 적어 둔다(화면에 안 보이는 것과 처리방침에서 빼는 것은 다르다).
 */

const AUTO_DELAY_MS = 8000;
const set = useKanaModelStore.setState;
let checking: Promise<void> | null = null;
let scheduled = false;

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

/** 앱 시작 시 한 번 부른다(App.tsx). 여러 번 불러도 한 번만 예약한다. */
export function scheduleKanaModelAutoDownload(): void {
  if (scheduled || useKanaModelStore.getState().status === "unsupported") return;
  scheduled = true;
  window.setTimeout(() => {
    const go = () => void autoDownload();
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 10_000 });
    else go();
  }, AUTO_DELAY_MS);
}

async function autoDownload() {
  await ensureKanaModelChecked();
  if (useKanaModelStore.getState().status !== "not-installed" || onMeteredConnection()) return;
  const headroom = await getStorageHeadroom();
  if (headroom !== null && headroom < KANA_MODEL.bytes * 1.2) return;
  set({ status: "downloading", receivedBytes: 0, error: null });
  try {
    await downloadKanaModel(() => {}, new AbortController().signal);
    set({ status: "installed", receivedBytes: KANA_MODEL.bytes });
  } catch (error) {
    // 조용히 그만둔다 — 다음 방문 때 다시 받는다. 원인은 디버그용으로만 남긴다.
    console.info("[발음 판정 모델] 백그라운드 받기 실패", error);
    set({ status: "not-installed", error: null });
  }
}
