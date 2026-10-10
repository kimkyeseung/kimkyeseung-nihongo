import { isOpfsSupported } from "./gemmaModel";

/**
 * 오십음도 발음 게임의 **기기 안 발음 판정 모델** 파일 — 내려받기 + OPFS 저장.
 *
 * 브라우저 음성 인식은 가나 한 글자를 받아 적지 못한다(Chrome은 결과 없이 끝, 웨일은 빈 결과 — 발음 게임 절).
 * 그래서 일본어 음소 인식 모델(prj-beatrice/japanese-hubert-base-phoneme-ctc-v3, Apache-2.0)을 ONNX(fp16)로
 * 바꿔 브라우저에서 돌린다. 목소리가 기기를 벗어나지 않는다.
 *
 * **Gemma와 달리 앱이 백그라운드에서 조용히 받는다**(사용자 결정 — 조건은 `kanaModelController.ts`). 받다 만 파일은
 * `.part`로 쓰다가 다 받은 뒤에만 이름을 붙이고, 이름 붙이기는 `move(dir, name)` 2-인자 형태(WebKit)다.
 * 189MB라 **이어받기는 하지 않는다** — 끊기면 다음 방문 때 처음부터 다시 받는다.
 * Gemma의 이어받기 코드는 그 파일 하나에 맞춰져 있어 일반화하려면 2GB 경로를 건드려야 했다.
 */

/**
 * 모델 파일 주소(Hugging Face — 공개·CORS 허용·Range 지원 확인). 비우면 배포 빌드에서는 기능이 숨는다(게임은 브라우저
 * 음성 인식으로만 돈다). 올릴 묶음은 저장소 밖 `lab-models/hf-upload/`에 있다.
 */
const PUBLISHED_URL: string =
  "https://huggingface.co/kyeseung/japanese-hubert-base-phoneme-ctc-v3-onnx/resolve/main/model_fp16.onnx";

export const KANA_MODEL = {
  label: "일본어 발음 판정 모델",
  url: PUBLISHED_URL,
  /** 실제 크기. 진행률과 받은 파일 검증에 함께 쓴다. 파일을 바꾸면 같이 바꿀 것. */
  bytes: 189_110_821,
  opfsName: "kana-phoneme-hubert-v3-fp16.onnx",
} as const;

const PARTIAL_NAME = `${KANA_MODEL.opfsName}.part`;

/** 이 브라우저에서 모델을 받아 쓸 수 있는지(주소가 있고 OPFS가 있는지). */
export function isKanaModelAvailable(): boolean {
  return KANA_MODEL.url !== "" && isOpfsSupported();
}

/** 받아 둔 모델. 없거나 크기가 안 맞으면 null(맞지 않는 파일은 지운다). */
export async function getCachedKanaModel(): Promise<File | null> {
  if (!isOpfsSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(KANA_MODEL.opfsName)).getFile();
    if (file.size !== KANA_MODEL.bytes) {
      await root.removeEntry(KANA_MODEL.opfsName).catch(() => {});
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

export async function deleteKanaModel(): Promise<void> {
  if (!isOpfsSupported()) return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(KANA_MODEL.opfsName).catch(() => {});
  await root.removeEntry(PARTIAL_NAME).catch(() => {});
}

/** 받아서 OPFS에 저장한다. 받은 조각은 메모리에 쌓지 않고 바로 흘려보낸다. */
export async function downloadKanaModel(
  onProgress: (receivedBytes: number) => void,
  signal: AbortSignal
): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const partial = await root.getFileHandle(PARTIAL_NAME, { create: true });
  const writable = await partial.createWritable();
  let received = 0;
  try {
    const res = await fetch(KANA_MODEL.url, { signal });
    if (!res.ok || !res.body) throw new Error(`모델을 받지 못했어요 (HTTP ${res.status})`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      onProgress(received);
    }
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    await root.removeEntry(PARTIAL_NAME).catch(() => {});
    throw error;
  }
  if (received !== KANA_MODEL.bytes) {
    await root.removeEntry(PARTIAL_NAME).catch(() => {});
    throw new Error(`받은 파일 크기가 맞지 않아요 (${received} / ${KANA_MODEL.bytes})`);
  }
  // Safari(WebKit)는 2-인자 형태만 받는다 — gemmaModel.ts의 renamePartialToFinal과 같은 이유.
  try {
    await partial.move(root, KANA_MODEL.opfsName);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await partial.move(KANA_MODEL.opfsName);
  }
  const file = await getCachedKanaModel();
  if (!file) throw new Error("받은 모델을 저장하지 못했어요");
  return file;
}
