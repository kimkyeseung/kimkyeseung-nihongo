/**
 * OPFS(Origin Private File System)의 `move()`는 아직 TypeScript 기본 DOM 타입에 없다.
 * Gemma 모델을 "다 받은 뒤에만" 최종 이름으로 바꿔 다는 데 쓴다 (src/lib/gemmaModel.ts).
 *
 * **엔진마다 받아주는 인자가 다르다** — 타입만 보고 아무 형태나 쓰면 Safari에서 깨진다:
 *   - Chromium / Gecko: `move(name)`, `move(dir)`, `move(dir, name)` 전부 지원
 *   - WebKit:           `move(destination, newName)` **2-인자 형태만** 구현
 * 그래서 호출부는 항상 2-인자 형태를 쓴다(gemmaModel.ts의 `renamePartialToFinal` 참고).
 */
declare global {
  interface FileSystemFileHandle {
    move(newName: string): Promise<void>;
    move(newParent: FileSystemDirectoryHandle, newName?: string): Promise<void>;
  }
}

export {};
