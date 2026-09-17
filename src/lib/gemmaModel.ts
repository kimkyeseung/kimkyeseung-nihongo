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

    // 다 받은 뒤에야 최종 이름을 붙인다 — 중간에 끊긴 파일이 완성본 행세를 못 하게.
    await partial.move(GEMMA_MODEL.opfsName);
    const file = await (await root.getFileHandle(GEMMA_MODEL.opfsName)).getFile();
    if (file.size !== GEMMA_MODEL.bytes) {
      await deleteCachedModel();
      throw new Error(`받은 파일 크기가 맞지 않습니다 (${file.size} / ${GEMMA_MODEL.bytes})`);
    }
    return file;
  } catch (error) {
    await writable.abort().catch(() => {});
    await root.removeEntry(PARTIAL_NAME).catch(() => {});
    throw error;
  }
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
