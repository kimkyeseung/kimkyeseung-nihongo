import { useEffect } from "react";

/**
 * 다이얼로그·바텀시트가 떠 있는 동안 뒤쪽 본문의 스크롤을 멈춘다. **모달을 새로 만들면 이 훅을 부르고
 * 바깥 막(`fixed inset-0`)에 `data-modal`을 붙일 것.**
 *
 * body만 잠그면 안 된다 — 이 앱은 body가 아니라 Layout의 `<main>`과 선생님·회화의 메시지 목록 같은
 * **안쪽 스크롤 영역**이 스크롤된다(헤더/네비 레이아웃 절). 그래서 `<html data-scroll-locked>` 하나를
 * 켜고, index.css가 그동안 `data-modal` 밖의 `overflow-y-auto`를 전부 `overflow: hidden`으로 바꾼다.
 * hidden은 스크롤 위치를 버리지 않으므로 닫으면 보던 자리 그대로다.
 *
 * 다이얼로그가 겹쳐 열릴 수 있어서(단어 뜻 → 한자 상세) 개수를 센다. 마지막 하나가 닫힐 때 푼다.
 */
let lockCount = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount += 1;
    document.documentElement.dataset.scrollLocked = "";
    return () => {
      lockCount -= 1;
      if (lockCount === 0) delete document.documentElement.dataset.scrollLocked;
    };
  }, [active]);
}
