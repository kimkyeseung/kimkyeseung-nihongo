/**
 * 화면이 꺼지지 않게 붙잡는다 (Screen Wake Lock API).
 *
 * Gemma 모델 2GB를 받는 동안 화면이 꺼지면 브라우저가 탭을 얼리고 진행 중인 `fetch`를 죽인다.
 * 이 함수는 그중 "화면이 저절로 꺼지는" 경우만 막는다 — **사용자가 다른 앱으로 전환하는 것은
 * 막을 수 없다.** 그쪽은 이어받기(gemmaModel.ts)로 받은 만큼을 살리는 수밖에 없다.
 *
 * React 훅이 아니라 평범한 함수인 이유: 다운로드를 소유한 것이 컴포넌트가 아니라 모듈
 * (gemmaDownloadController.ts)이기 때문이다. 훅으로 두면 화면을 옮길 때 락이 같이 풀린다.
 *
 * 브랜드가 아니라 기능으로 판단한다: 지원하지 않는 브라우저(그리고 배터리 절약 모드 등으로
 * 거절하는 기기)에서는 조용히 아무것도 하지 않는다. 락을 못 잡았다고 하던 일을 멈추지 않는다.
 *
 * @returns 락을 놓는 함수. 반드시 불러야 한다 — 안 부르면 다운로드가 끝나도 화면이 안 꺼진다.
 */
export function holdScreenAwake(): () => void {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return () => {};
  }

  let sentinel: WakeLockSentinel | null = null;
  let disposed = false;

  const drop = () => {
    const held = sentinel;
    sentinel = null;
    void held?.release().catch(() => {});
  };

  const acquire = async () => {
    // 숨겨진 상태에서 요청하면 거절된다(NotAllowedError) — 보일 때만 잡는다.
    if (disposed || sentinel || document.visibilityState !== "visible") return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      // 기다리는 사이에 놓였을 수 있다. 그대로 두면 영영 안 풀린다.
      if (disposed) drop();
    } catch {
      // 기기가 거절한 것이고(저전력 모드 등), 그건 기기의 판단이다.
    }
  };

  // 탭이 숨겨지면 브라우저가 락을 자동으로 풀어버린다. 돌아왔을 때 다시 잡아야 계속 유효하다.
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  void acquire();

  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    drop();
  };
}
