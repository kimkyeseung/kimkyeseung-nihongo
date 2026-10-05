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
export function trackAppViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const root = document.documentElement;
  let frame = 0;

  const update = () => {
    frame = 0;
    if (Math.abs(vv.scale - 1) > 0.01) {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      return;
    }
    root.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
    root.style.setProperty("--app-top", `${Math.round(vv.offsetTop)}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  update();
  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  return () => {
    vv.removeEventListener("resize", schedule);
    vv.removeEventListener("scroll", schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
