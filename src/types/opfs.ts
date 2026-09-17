/**
 * OPFS(Origin Private File System)의 `move()`는 아직 TypeScript 기본 DOM 타입에 없지만
 * Chromium에는 구현되어 있다. Gemma 모델을 "다 받은 뒤에만" 최종 이름으로 바꿔 다는 데 쓴다
 * (src/lib/gemmaModel.ts) — 이 기능 자체가 WebGPU 때문에 어차피 Chromium 전용이다.
 */
declare global {
  interface FileSystemFileHandle {
    move(newName: string): Promise<void>;
    move(newParent: FileSystemDirectoryHandle, newName?: string): Promise<void>;
  }
}

export {};
