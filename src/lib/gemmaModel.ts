/**
 * Gemma 4 모델 파일 내려받기 + OPFS 캐시.
 *
 * Chrome의 Prompt API(`window.LanguageModel`)는 어떤 모델을 쓸지 고를 수 없다 —
 * `LanguageModel.create()`에 모델 선택 파라미터 자체가 없고 브라우저가 들고 있는 모델을 쓴다.
 * 그래서 "Prompt API의 모델을 바꾸는" 게 아니라, WebGPU 위에서 도는 별도 엔진(LiteRT-LM)을
 * 두 번째 선택지로 두고 사용자가 원할 때만 켜는 구조다 (src/lib/gemmaEngine.ts).
 *
 * 모델 파일은 2GB라서 자동으로 받지 않는다 — 반드시 사용자가 버튼을 눌러야 시작한다.
 */

export const GEMMA_MODEL = {
  id: "gemma-4-E2B-it-web",
  label: "Gemma 4 E2B",
  /** Hugging Face 공개 파일 (로그인·토큰 불필요, CORS 허용 확인됨) */
  url: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
  /** 실제 Content-Length. 진행률과 다운로드 검증에 함께 쓴다. */
  bytes: 2_008_432_640,
  opfsName: "gemma-4-E2B-it-web.litertlm",
} as const;

/** 받다 만 파일을 완성본으로 오인하지 않도록, 다 받기 전까지는 이 이름으로 쓴다. */
const PARTIAL_NAME = `${GEMMA_MODEL.opfsName}.part`;

/**
 * WebGPU 지원 여부. LiteRT-LM은 WebGPU 백엔드에서만 돈다.
 * (Prompt API 지원 여부를 `isPromptApiSupported()` 한 곳에서만 판단하는 것과 같은 규칙 —
 *  새로 확인이 필요하면 `navigator.gpu`를 여기저기 쓰지 말고 이 함수를 재사용할 것.)
 */
export function isWebGpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** OPFS(Origin Private File System) 지원 여부. 모델을 저장해둘 곳이 없으면 기능 자체를 못 쓴다. */
export function isOpfsSupported(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

/**
 * 지금 origin이 더 쓸 수 있는 바이트 수. 브라우저가 알려주지 않으면 null(= 확인 불가).
 * 할당량은 브라우저마다 크게 다르다 — 2GB가 무조건 들어간다고 가정하면 안 된다.
 */
export async function getStorageHeadroom(): Promise<number | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== "number") return null;
    return quota - (usage ?? 0);
  } catch {
    return null;
  }
}

/**
 * 지속 저장(persistent storage)을 요청한다. 거절돼도 다운로드는 그대로 진행한다 —
 * best-effort 저장소에 남을 뿐이고, 그건 사용자가 감수할 문제다.
 *
 * 2GB짜리라 이게 꽤 중요하다: 지속 저장이 아니면 브라우저가 저장 공간이 부족할 때 지워버린다.
 * 특히 Safari는 일정 기간 방문이 없으면 OPFS를 비우고, 홈 화면/Dock에 추가된 사이트에만
 * 지속 저장을 허락한다 — 그 경우 사용자는 2GB를 다시 받아야 한다.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * 이미 받아둔 모델 파일을 반환한다. 없거나 크기가 안 맞으면(=받다 만 파일) null.
 * OPFS는 origin 단위라 localhost:5173과 127.0.0.1:5173은 서로 다른 저장소를 쓴다.
 */
export async function getCachedModelFile(): Promise<File | null> {
  if (!isOpfsSupported()) return null;
  try {
    const root = await opfsRoot();
    const handle = await root.getFileHandle(GEMMA_MODEL.opfsName);
    const file = await handle.getFile();
    if (file.size !== GEMMA_MODEL.bytes) {
      // 크기가 다르면 손상된 캐시다. 지우고 없는 것으로 취급한다.
      await root.removeEntry(GEMMA_MODEL.opfsName).catch(() => {});
      return null;
    }
    return file;
  } catch {
    // NotFoundError 등 — 아직 안 받은 상태
    return null;
  }
}

/**
 * 받다 만 파일에 최종 이름을 붙인다.
 *
 * **엔진마다 받아주는 인자가 다르다 (실제로 겪은 버그)**: 표준 초안에는 `move(name)`과
 * `move(dir, name)` 오버로드가 둘 다 있지만 **WebKit은 `move(destination, newName)` 2-인자
 * 형태만 구현한다**. Safari에서 `move(name)`을 부르면 `TypeError: Not enough arguments`가
 * 나고, 하필 이 호출이 2GB를 다 받은 **맨 마지막 단계**라 다운로드를 통째로 날린다.
 * 2-인자 형태는 Chromium·Gecko·WebKit 셋 다 지원하므로 그쪽을 기본으로 쓴다.
 */
async function renamePartialToFinal(
  root: FileSystemDirectoryHandle,
  partial: FileSystemFileHandle
): Promise<void> {
  try {
    await partial.move(root, GEMMA_MODEL.opfsName);
  } catch (error) {
    // 2-인자 형태를 모르는 엔진이 있다면 표준의 1-인자 형태로 한 번 더 시도한다.
    if (!(error instanceof TypeError)) throw error;
    await partial.move(GEMMA_MODEL.opfsName);
  }
}

/**
 * 다 받아놓고 이름 붙이기에서만 실패한 `.part`가 있으면 그 핸들을 돌려준다.
 * 크기가 정확히 맞을 때만 인정한다 — 받다 만 조각은 쓸 수 없다(이어받기는 구현하지 않았다).
 */
async function getCompletePartial(
  root: FileSystemDirectoryHandle
): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await root.getFileHandle(PARTIAL_NAME);
    const file = await handle.getFile();
    return file.size === GEMMA_MODEL.bytes ? handle : null;
  } catch {
    return null;
  }
}

/** 최종 이름으로 저장된 모델을 읽어 크기까지 확인한다. */
async function readFinalModel(root: FileSystemDirectoryHandle): Promise<File> {
  const file = await (await root.getFileHandle(GEMMA_MODEL.opfsName)).getFile();
  if (file.size !== GEMMA_MODEL.bytes) {
    await deleteCachedModel();
    throw new Error(`받은 파일 크기가 맞지 않습니다 (${file.size} / ${GEMMA_MODEL.bytes})`);
  }
  return file;
}

export async function deleteCachedModel(): Promise<void> {
  if (!isOpfsSupported()) return;
  const root = await opfsRoot();
  await root.removeEntry(GEMMA_MODEL.opfsName).catch(() => {});
  await root.removeEntry(PARTIAL_NAME).catch(() => {});
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  /** 0~1 */
  ratio: number;
  /** 최근 구간 속도(bytes/sec). 남은 시간 표시에 쓴다. */
  bytesPerSecond: number;
}

/**
 * 모델을 내려받아 OPFS에 저장하고 파일을 돌려준다.
 * 이미 받아둔 게 있으면 그대로 반환한다(다시 받지 않는다).
 *
 * 진행률은 LiteRT-LM이 제공하지 않으므로(Engine.create에 progress 콜백이 없다) 여기서 직접
 * `fetch` 응답 스트림의 바이트를 세면서 보고한다. 받은 조각은 메모리에 쌓지 않고 바로 OPFS에
 * 흘려보낸다 — 2GB를 통째로 메모리에 들고 있으면 탭이 죽는다.
 */
export async function downloadModel(
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<File> {
  const cached = await getCachedModelFile();
  if (cached) return cached;

  const root = await opfsRoot();

  // 다 받아놓고 이름 붙이기에서만 실패한 적이 있으면 `.part`가 온전한 채로 남아 있다.
  // 2GB를 다시 받게 하지 않고 이름만 다시 붙인다.
  const complete = await getCompletePartial(root);
  if (complete) {
    await renamePartialToFinal(root, complete);
    return readFinalModel(root);
  }

  // 2GB를 다 받고 나서 할당량에 걸리면 시간도 데이터도 통째로 버리게 된다 — 먼저 확인한다.
  // 확인할 수 없는 브라우저(null)에서는 일단 시도한다: 막을 근거가 없으므로.
  const headroom = await getStorageHeadroom();
  if (headroom !== null && headroom < GEMMA_MODEL.bytes) {
    throw new Error(
      `저장 공간이 부족합니다. ${formatBytes(GEMMA_MODEL.bytes)}가 필요한데 ` +
        `${formatBytes(Math.max(0, headroom))}만 쓸 수 있어요. 브라우저 저장 공간을 비우고 다시 시도해 주세요.`
    );
  }
  // 받아둔 모델이 조용히 지워지지 않도록 요청만 해둔다. 거절돼도 계속 진행한다.
  await requestPersistentStorage();

  const partial = await root.getFileHandle(PARTIAL_NAME, { create: true });
  const writable = await partial.createWritable();

  try {
    const response = await fetch(GEMMA_MODEL.url, { signal });
    if (!response.ok) {
      throw new Error(`모델 내려받기 실패 (HTTP ${response.status})`);
    }
    if (!response.body) {
      throw new Error("이 브라우저에서는 스트리밍 다운로드를 쓸 수 없습니다.");
    }

    const headerLength = Number(response.headers.get("content-length"));
    const totalBytes = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : GEMMA_MODEL.bytes;

    const reader = response.body.getReader();
    let receivedBytes = 0;
    let lastTime = performance.now();
    let lastBytes = 0;
    let bytesPerSecond = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      receivedBytes += value.byteLength;

      // 속도는 매 청크마다 계산하면 요동치므로 0.5초 단위로만 갱신한다.
      const now = performance.now();
      const elapsed = now - lastTime;
      if (elapsed >= 500) {
        bytesPerSecond = ((receivedBytes - lastBytes) / elapsed) * 1000;
        lastTime = now;
        lastBytes = receivedBytes;
      }

      onProgress({
        receivedBytes,
        totalBytes,
        ratio: receivedBytes / totalBytes,
        bytesPerSecond,
      });
    }

    await writable.close();
  } catch (error) {
    // 받다 만 조각은 쓸모가 없다(이어받기 미구현) — 지우고 다음에 처음부터 받게 한다.
    await writable.abort().catch(() => {});
    await root.removeEntry(PARTIAL_NAME).catch(() => {});
    throw error;
  }

  // 여기부터는 파일이 온전하다. 다 받은 뒤에야 최종 이름을 붙인다 — 중간에 끊긴 파일이
  // 완성본 행세를 못 하게. **실패해도 `.part`를 지우지 않는다**: 다시 시도하면 위의 재사용
  // 경로가 곧바로 집어가므로 2GB를 다시 받지 않아도 된다.
  await renamePartialToFinal(root, partial);
  return readFinalModel(root);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)}GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)}MB`;
  return `${Math.round(bytes / 1_000)}KB`;
}

/** 남은 시간을 "약 3분 20초" 같은 한국어 문구로. 속도를 모르면 null. */
export function formatEta(remainingBytes: number, bytesPerSecond: number): string | null {
  if (bytesPerSecond <= 0) return null;
  const seconds = Math.round(remainingBytes / bytesPerSecond);
  if (seconds < 60) return `약 ${seconds}초 남음`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `약 ${minutes}분 남음` : `약 ${minutes}분 ${rest}초 남음`;
  return `약 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음`;
}
