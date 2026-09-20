import { useCallback, useLayoutEffect, useRef } from "react";

/** 바닥에서 이만큼 안쪽이면 "바닥을 보고 있다"고 본다. 한 줄 높이보다 넉넉하게. */
const BOTTOM_THRESHOLD = 64;
/** 스크롤이 이만큼 멎으면 사용자가 손을 뗀 것으로 본다(관성 스크롤이 끝날 만큼). */
const USER_IDLE_MS = 200;

/**
 * 대화 목록을 **바닥에 붙여 둔다**(선생님·회화 페이지).
 *
 * **`scrollIntoView({ behavior: "smooth" })`를 쓰지 말 것 (실제로 겪은 버그).** 예전에는
 * 메시지가 바뀔 때마다 그걸 불렀는데, 스트리밍은 청크마다 메시지를 바꾸므로 **1초에 수십 번**
 * 불린다. 부드러운 스크롤은 매번 이전 애니메이션을 끊고 새 목표로 다시 출발하는데 그 목표가
 * 계속 아래로 자라고 있어서, 화면이 **위아래로 떨렸다**(대화가 화면을 넘기기 시작하는 두 번째
 * 문답부터 보인다). 애니메이션 없이 즉시 바닥으로 붙이면 떨릴 것이 없고, 글자가 자라는 것은
 * 그 자체로 자연스럽게 보인다.
 *
 * 덤으로 **사용자가 위로 올려 읽는 중이면 따라가지 않는다.** 예전에는 답변이 오는 동안 위로
 * 올릴 수가 없었다(바로 끌려 내려왔다). 다시 바닥 근처로 내려오면 스스로 다시 붙는다.
 *
 * 인자로는 **바뀌면 다시 바닥에 붙어야 하는 값들**을 넘긴다(메시지 목록, 답변 중 여부).
 *
 * 반환값은 **스크롤 컨테이너**(목록을 감싼 `overflow-y-auto`)에 달 ref다. 조건부로 렌더되는
 * 화면(회화는 시나리오를 고른 뒤에야 목록이 생긴다)에서도 붙었다 떨어졌다를 놓치지 않도록
 * 콜백 ref로 만들었다.
 */
export function useStickToBottom<T extends HTMLElement>(...deps: unknown[]) {
  const elRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const stick = useRef(true);
  /** 지금 스크롤을 움직이고 있는 것이 사용자인가. */
  const userDriving = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pin = useCallback(() => {
    const el = elRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, []);

  /**
   * **스크롤 이벤트만 보고 판단하면 안 된다 (실제로 겪은 버그).** 우리가 붙인 스크롤,
   * 컨테이너가 줄어들 때 브라우저가 하는 보정 같은 것도 똑같이 scroll 이벤트로 온다. 그걸
   * 사용자가 올린 것으로 오해해 한 번 "안 따라감"으로 넘어가면, 되돌리는 길은 사용자가 직접
   * 바닥까지 내려오는 것뿐이라 **그 뒤로 영영 안 따라간다**(답변 끝이 화면 밖에 남았다).
   * 그래서 사용자가 실제로 손을 댄 동안에만 판단한다.
   */
  const markUserDriving = useCallback(() => {
    userDriving.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      userDriving.current = false;
    }, USER_IDLE_MS);
  }, []);

  const handleScroll = useCallback(() => {
    const el = elRef.current;
    if (!el || !userDriving.current) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  const setRef = useCallback(
    (node: T | null) => {
      const previous = elRef.current;
      if (previous) {
        previous.removeEventListener("scroll", handleScroll);
        for (const type of USER_EVENTS) previous.removeEventListener(type, markUserDriving);
      }
      observerRef.current?.disconnect();
      observerRef.current = null;
      elRef.current = node;
      if (!node) return;

      node.addEventListener("scroll", handleScroll, { passive: true });
      for (const type of USER_EVENTS) {
        node.addEventListener(type, markUserDriving, { passive: true });
      }

      /**
       * **컨테이너가 작아질 때도 다시 붙여야 한다 (실제로 겪은 문제).** 답변이 끝나면 숨겨뒀던
       * 입력 영역이 돌아오면서 목록이 그만큼 짧아지는데, 그 순간 메시지는 바뀌지 않으므로
       * 아래 effect가 돌지 않는다. 그대로 두면 **방금 받은 답변의 끝이 화면 밖으로 밀린 채**
       * 남는다(실측 113px). 크기가 바뀌는 다른 경우(기억 확인 칩, 모바일 키보드)도 같이 걸린다.
       */
      const observer = new ResizeObserver(pin);
      observer.observe(node);
      observerRef.current = observer;
    },
    [handleScroll, markUserDriving, pin]
  );

  /**
   * 페인트 전에 붙인다 — `useEffect`면 새 줄이 한 프레임 보였다가 스크롤된다.
   *
   * **메시지 말고 "답변 중인가"도 같이 넘길 것.** 답변이 끝나면 숨겨뒀던 입력 영역이 돌아와
   * 목록이 짧아지는데, 그때 메시지는 바뀌지 않는다. 위의 ResizeObserver도 같은 자리를 받치고
   * 있지만, 크기 변화가 React가 아는 상태에서 오는 경우라면 그 상태를 그냥 넘기는 편이
   * 확실하다(브라우저가 리사이즈 통지를 미루는 환경이 실제로 있다).
   */
  useLayoutEffect(pin, [...deps, pin]);

  return setRef;
}

/** "지금 움직이는 건 사용자다"로 볼 입력들. 휠·터치·스크롤바 끌기·키보드. */
const USER_EVENTS = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const;
