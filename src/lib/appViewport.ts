/**
 * 모바일 키보드가 올라와도 앱이 "보이는 영역"에 꼭 맞게 한다.
 *
 * 모바일 브라우저는 키보드를 화면 **위에 덮고**, 보이는 영역(visual viewport)만 줄인 뒤 입력창이
 * 보이도록 문서를 밀어 올린다. 레이아웃은 키보드 없는 높이(`h-svh`) 그대로라 그 차이만큼 **화면 전체가
 * 스크롤되어** 헤더가 위로 사라지고 손으로 끌면 페이지가 통째로 움직였다(실제로 보고받았다).
 * Android Chrome은 `interactive-widget=resizes-content`(index.html)로 레이아웃 자체를 줄이게 할 수
 * 있지만 iOS Safari는 그 설정을 모른다 — 그래서 visual viewport의 크기와 위치를 CSS 변수로 내려,
 * Layout의 뿌리와 모달 막이 **늘 보이는 영역에 붙어 있게** 한다(index.css의 `--app-height`/`--app-top`).
 *
 * 핀치 줌 중에는 visual viewport가 줌 때문에 작아진 것이라 따라가면 앱이 쪼그라든다 — 그때는 변수를
 * 지워 기본값(100svh)으로 돌아간다.
 */
/** 이만큼(px) 넘게 줄어들어야 키보드로 본다 — 주소창이 접히고 펴지는 정도(수십 px)와 가르려고. */
export const KEYBOARD_MIN_SHRINK = 150;

/**
 * 화면 키보드가 올라와 있는가. **입력창에 포커스가 있고, 보이는 영역이 키보드만큼 줄었을 때만** 참이다.
 * 포커스만 보면 Android에서 뒤로 가기로 키보드를 내려도(포커스는 남는다) 계속 숨어 있고, 높이만 보면
 * 주소창이 접히는 것·분할 화면을 키보드로 착각한다.
 */
export function isKeyboardOpen(state: { fullHeight: number; height: number; editableFocused: boolean }): boolean {
  return state.editableFocused && state.fullHeight - state.height > KEYBOARD_MIN_SHRINK;
}

/** 화면 키보드를 부르는 요소인가(체크박스·버튼 같은 input은 빼고). */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/.test(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

export function trackAppViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let frame = 0;
  // 키보드가 없을 때의 높이. 화면 너비가 바뀌면(회전) 새로 잰다.
  let fullHeight = vv.height;
  let fullWidth = window.innerWidth;

  const update = () => {
    frame = 0;
    if (Math.abs(vv.scale - 1) > 0.01) {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      delete root.dataset.keyboard;
      return;
    }
    if (window.innerWidth !== fullWidth) {
      fullWidth = window.innerWidth;
      fullHeight = vv.height;
    }
    fullHeight = Math.max(fullHeight, vv.height);
    root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
    root.style.setProperty("--app-top", `${Math.round(vv.offsetTop)}px`);
    // 키보드가 떠 있는 동안 하단 네비를 숨긴다(index.css) — 키보드 위에 네비가 남으면 좁은 화면에서
    // 대화 영역이 그만큼 더 줄어든다(사용자 요청).
    const open = isKeyboardOpen({
      fullHeight,
      height: vv.height,
      editableFocused: isEditable(document.activeElement),
    });
    if (open) root.dataset.keyboard = "";
    else delete root.dataset.keyboard;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  update();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  // 키보드는 포커스보다 늦게 올라오고 먼저 내려가기도 한다 — 포커스가 바뀔 때도 다시 본다.
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
