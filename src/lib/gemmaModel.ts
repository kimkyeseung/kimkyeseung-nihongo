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
 * 받다 만 조각과 짝을 이루는 ETag(내용 해시). 이어받기 전에 "그 사이 원본이 바뀌지 않았는지"를
 * `If-Range`로 확인하는 데 쓴다. 조각과 생사를 같이해야 하므로 localStorage가 아니라
 * OPFS에 조각 바로 옆에 둔다 — 한쪽만 지워지면 이어받기가 엉뚱한 바이트를 이어 붙인다.
 */
const PARTIAL_ETAG_NAME = `${PARTIAL_NAME}.etag`;

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

/** 조각과 그 짝(ETag)을 함께 지운다. 한쪽만 남으면 이어받기 판단이 어긋난다. */
async function removePartial(root: FileSystemDirectoryHandle): Promise<void> {
  await root.removeEntry(PARTIAL_NAME).catch(() => {});
  await root.removeEntry(PARTIAL_ETAG_NAME).catch(() => {});
}

async function readPartialEtag(root: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const file = await (await root.getFileHandle(PARTIAL_ETAG_NAME)).getFile();
    const text = (await file.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function writePartialEtag(root: FileSystemDirectoryHandle, etag: string | null): Promise<void> {
  if (!etag) {
    // ETag를 안 주는 서버라면 이어받기를 포기한다 — 짝을 확인할 수 없는 조각은 위험하다.
    await root.removeEntry(PARTIAL_ETAG_NAME).catch(() => {});
    return;
  }
  const handle = await root.getFileHandle(PARTIAL_ETAG_NAME, { create: true });
  const writable = await handle.createWritable();
  await writable.write(etag);
  await writable.close();
}

/**
 * 다 받아놓고 이름 붙이기에서만 실패한 `.part`가 있으면 그 핸들을 돌려준다.
 * 크기가 정확히 맞을 때만 인정한다.
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

/**
 * 받다 만 조각의 크기. 없으면 0.
 * 대문 카드가 "이어받기 (1.2GB부터)"라고 말할 수 있도록 노출한다.
 */
export async function getPartialBytes(): Promise<number> {
  if (!isOpfsSupported()) return 0;
  try {
    const root = await opfsRoot();
    const file = await (await root.getFileHandle(PARTIAL_NAME)).getFile();
    return file.size;
  } catch {
    return 0;
  }
}

/** 받다 만 조각을 버린다. 처음부터 다시 받고 싶을 때(조각이 의심스러울 때) 쓴다. */
export async function discardPartialDownload(): Promise<void> {
  if (!isOpfsSupported()) return;
  await removePartial(await opfsRoot());
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
  await removePartial(root);
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
 * 브라우저가 내려받기를 끊어서 실패한 경우. 받아둔 조각은 남아 있으므로 이어받을 수 있다.
 *
 * 모바일에서 화면이 꺼지거나 다른 앱으로 전환하면 브라우저가 탭을 얼리고 진행 중인 `fetch`를
 * 죽인다. 이때 브라우저가 주는 문구는 엔진마다 다르다("Failed to fetch" / "Load failed" /
 * "Network Error"…). 그걸 그대로 보여주면 사용자는 뭘 해야 할지 알 수 없다.
 */
export class DownloadInterruptedError extends Error {
  readonly receivedBytes: number;
  constructor(receivedBytes: number, cause: unknown) {
    super("다운로드가 중단되었습니다", { cause });
    this.name = "DownloadInterruptedError";
    this.receivedBytes = receivedBytes;
  }
}

/**
 * `fetch`가 네트워크 문제로 실패했는지. 브라우저는 이 경우를 **문구가 제각각인 `TypeError`**로
 * 준다 — 문구로 판별하려 들면 엔진마다 새로 뚫린다. 타입으로만 본다.
 *
 * 주의: 이 판정은 내려받는 도중(fetch/스트림 읽기)에만 써야 한다. `move()`처럼 다른 단계의
 * TypeError까지 "중단"으로 오인하면 이어받기를 권하는 엉뚱한 안내가 나간다.
 */
function looksLikeNetworkInterruption(error: unknown): boolean {
  if (error instanceof DOMException) {
    // AbortError는 사용자가 취소를 눌렀거나 탭이 정리된 경우 — 조각을 남겨두는 편이 낫다.
    return error.name === "AbortError" || error.name === "NetworkError";
  }
  return error instanceof TypeError;
}

export interface DownloadFailure {
  /** 화면에 그대로 보여줄 한국어 문구 */
  message: string;
  /** 이어받기로 되살릴 수 있는 실패인지 */
  resumable: boolean;
}

/**
 * 실패 원인을 사용자가 읽을 수 있는 문구로 바꾼다.
 * 순수 함수라 테스트로 고정해둔다 — 문구가 틀려도 콘솔에는 아무것도 안 찍힌다.
 */
export function describeDownloadFailure(error: unknown, partialBytes: number): DownloadFailure {
  if (error instanceof DownloadInterruptedError) {
    if (partialBytes > 0) {
      return {
        message:
          `내려받기가 중단되었습니다 — 화면이 꺼지거나 다른 앱으로 전환하면 브라우저가 내려받기를 멈춥니다. ` +
          `받아둔 ${formatBytes(partialBytes)}는 그대로 있으니 이어받기를 누르면 그 지점부터 계속됩니다.`,
        resumable: true,
      };
    }
    return {
      message: "내려받기가 중단되었습니다. 네트워크를 확인하고 다시 시도해 주세요.",
      resumable: false,
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    resumable: partialBytes > 0,
  };
}

export interface ResumePlan {
  /** 이번 응답의 본문을 파일 어디서부터 쓸지. 0이면 처음부터 다시 쓴다. */
  writeOffset: number;
  /** 파일 전체 크기(진행률 분모) */
  totalBytes: number;
}

/**
 * 이어받기 요청에 대한 서버 응답을 보고 "어디서부터 쓸지"를 정한다.
 *
 * **이 판단이 틀리면 2GB짜리 파일이 조용히 오염된다** — 오프셋이 어긋난 채로 이어 붙여도
 * 크기는 맞아떨어질 수 있어서 마지막 크기 검사를 그냥 통과한다. 그래서 순수 함수로 떼어
 * 테스트로 고정했다(gemmaModel.test.ts).
 *
 * - `206`: 서버가 이어받기를 받아줬다. `Content-Range`의 시작 위치가 우리가 요청한 지점과
 *   정확히 같을 때만 인정한다.
 * - `200`: 서버가 `If-Range`를 보고 "그 사이 원본이 바뀌었다"고 판단해 전체를 보낸 것이다
 *   (Range를 아예 지원하지 않는 서버도 여기로 온다). 조각을 버리고 처음부터 쓴다.
 */
export function planResumeWrite(
  status: number,
  contentRange: string | null,
  contentLength: string | null,
  requestedOffset: number
): ResumePlan {
  if (status === 206) {
    const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec((contentRange ?? "").trim());
    if (!match) {
      throw new Error(`서버 응답을 이해할 수 없습니다 (Content-Range: ${contentRange ?? "없음"})`);
    }
    const start = Number(match[1]);
    const total = Number(match[3]);
    if (start !== requestedOffset) {
      throw new Error(`이어받기 위치가 어긋났습니다 (${start} ≠ ${requestedOffset})`);
    }
    if (total !== GEMMA_MODEL.bytes) {
      throw new Error(`서버의 모델 파일이 바뀌었습니다 (${total} ≠ ${GEMMA_MODEL.bytes})`);
    }
    return { writeOffset: start, totalBytes: total };
  }

  if (status === 200) {
    const length = Number(contentLength);
    return {
      writeOffset: 0,
      totalBytes: Number.isFinite(length) && length > 0 ? length : GEMMA_MODEL.bytes,
    };
  }

  throw new Error(`모델 내려받기 실패 (HTTP ${status})`);
}

/**
 * 모델을 내려받아 OPFS에 저장하고 파일을 돌려준다.
 * 이미 받아둔 게 있으면 그대로 반환한다(다시 받지 않는다).
 *
 * 진행률은 LiteRT-LM이 제공하지 않으므로(Engine.create에 progress 콜백이 없다) 여기서 직접
 * `fetch` 응답 스트림의 바이트를 세면서 보고한다. 받은 조각은 메모리에 쌓지 않고 바로 OPFS에
 * 흘려보낸다 — 2GB를 통째로 메모리에 들고 있으면 탭이 죽는다.
 *
 * **중단되면 받은 만큼을 남기고 다음 호출에서 이어받는다.** 모바일에서는 화면이 꺼지거나 다른
 * 앱으로 전환하는 것만으로 브라우저가 `fetch`를 죽이기 때문에, 이어받기가 없으면 사용자는
 * 알림 하나 확인하고 돌아올 때마다 2GB를 처음부터 다시 받아야 한다.
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

  // 이어받을 수 있는 조각이 있는지. ETag가 없으면(짝을 확인할 수 없으면) 이어받지 않는다.
  const partialBytes = await getPartialBytes();
  const partialEtag = partialBytes > 0 ? await readPartialEtag(root) : null;
  const resumeFrom = partialEtag && partialBytes > 0 && partialBytes < GEMMA_MODEL.bytes ? partialBytes : 0;

  // 2GB를 다 받고 나서 할당량에 걸리면 시간도 데이터도 통째로 버리게 된다 — 먼저 확인한다.
  // 확인할 수 없는 브라우저(null)에서는 일단 시도한다: 막을 근거가 없으므로.
  // 이어받는 중이면 이미 차지한 만큼은 빼고 본다.
  const headroom = await getStorageHeadroom();
  const needed = GEMMA_MODEL.bytes - resumeFrom;
  if (headroom !== null && headroom < needed) {
    throw new Error(
      `저장 공간이 부족합니다. ${formatBytes(needed)}가 필요한데 ` +
        `${formatBytes(Math.max(0, headroom))}만 쓸 수 있어요. 브라우저 저장 공간을 비우고 다시 시도해 주세요.`
    );
  }
  // 받아둔 모델이 조용히 지워지지 않도록 요청만 해둔다. 거절돼도 계속 진행한다.
  await requestPersistentStorage();

  const headers: Record<string, string> = {};
  if (resumeFrom > 0 && partialEtag) {
    headers.Range = `bytes=${resumeFrom}-`;
    // 그 사이 원본이 바뀌었으면 서버가 206 대신 200(전체)을 준다 — 오염된 조각에 이어 붙이지
    // 않기 위한 장치다. 이것 없이 Range만 보내면 다른 파일의 뒷부분을 이어 붙일 수 있다.
    headers["If-Range"] = partialEtag;
  }

  // 연결 자체가 끊긴 경우도 같은 문구로 안내한다 — 여기서 실패하면 브라우저가 주는 문구는
  // "Failed to fetch" 같은 영어 한 줄뿐이라 사용자가 뭘 해야 할지 알 수 없다.
  let response: Response;
  try {
    response = await fetch(GEMMA_MODEL.url, { signal, headers });
  } catch (error) {
    if (looksLikeNetworkInterruption(error)) throw new DownloadInterruptedError(resumeFrom, error);
    throw error;
  }

  if (!response.body) {
    throw new Error("이 브라우저에서는 스트리밍 다운로드를 쓸 수 없습니다.");
  }

  let plan: ResumePlan;
  try {
    plan = planResumeWrite(
      response.status,
      response.headers.get("content-range"),
      response.headers.get("content-length"),
      resumeFrom
    );
  } catch (error) {
    // 이어받기 **자체가** 어긋난 경우(위치 불일치, 416 Range Not Satisfiable)에만 조각을
    // 버린다. 안 그러면 같은 요청이 매번 같은 곳에서 실패해 영영 못 받는다.
    // 404·503처럼 조각과 무관한 실패에 2GB를 날리지 않도록 상태 코드로 구분한다.
    if (resumeFrom > 0 && (response.status === 206 || response.status === 416)) {
      await removePartial(root);
    }
    throw error;
  }

  // 처음부터 쓰는 경우에만 ETag를 새로 적는다(이어받는 중이면 기존 짝을 그대로 둔다).
  if (plan.writeOffset === 0) {
    await writePartialEtag(root, response.headers.get("etag"));
  }

  const partial = await root.getFileHandle(PARTIAL_NAME, { create: true });
  // keepExistingData 없이 열면 파일이 0바이트로 잘린다 — 이어받을 때는 반드시 켜야 한다.
  // (대신 Chromium은 이때 기존 데이터를 스왑 파일로 복사하므로, 이어받기를 시작할 때마다
  //  받아둔 만큼의 로컬 복사가 한 번 일어난다. 2GB를 다시 받는 것보다는 훨씬 싸다.)
  const writable = await partial.createWritable({ keepExistingData: plan.writeOffset > 0 });
  if (plan.writeOffset > 0) await writable.seek(plan.writeOffset);

  let receivedBytes = plan.writeOffset;

  try {
    const reader = response.body.getReader();
    let lastTime = performance.now();
    let lastBytes = receivedBytes;
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
        totalBytes: plan.totalBytes,
        ratio: receivedBytes / plan.totalBytes,
        bytesPerSecond,
      });
    }

    await writable.close();
  } catch (error) {
    if (looksLikeNetworkInterruption(error)) {
      // **여기서 abort()하면 받은 것이 통째로 사라진다.** createWritable()의 쓰기는 스왑
      // 파일에 쌓였다가 close() 시점에야 실제 파일에 반영되기 때문에, 이어받으려면 끊긴
      // 상황에서도 반드시 close()로 커밋해야 한다.
      //
      // 이번에 한 바이트도 못 받았어도 마찬가지다 — 이어받기를 시도하다 곧바로 끊긴 경우라
      // 조각을 지우면 **이어받으려던 1.9GB를 날린다**. keepExistingData로 연 스트림은
      // 아무것도 안 썼어도 close()하면 기존 내용 그대로 남는다.
      await writable.close().catch(() => {});
      throw new DownloadInterruptedError(receivedBytes, error);
    }
    // 그 밖의 실패(예: 디스크 오류)는 조각을 믿을 수 없다 — 지우고 처음부터 받게 한다.
    await writable.abort().catch(() => {});
    await removePartial(root);
    throw error;
  }

  // 여기부터는 파일이 온전하다. 다 받은 뒤에야 최종 이름을 붙인다 — 중간에 끊긴 파일이
  // 완성본 행세를 못 하게. **실패해도 `.part`를 지우지 않는다**: 다시 시도하면 위의 재사용
  // 경로가 곧바로 집어가므로 2GB를 다시 받지 않아도 된다.
  await renamePartialToFinal(root, partial);
  await root.removeEntry(PARTIAL_ETAG_NAME).catch(() => {});
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
