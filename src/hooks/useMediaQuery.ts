import { useSyncExternalStore } from "react";

/**
 * 미디어 쿼리가 맞는지 따라간다(창 크기를 바꾸면 다시 렌더). CSS의 `lg:` 같은 클래스로는 모양만
 * 바꿀 수 있고 "모달로 띄울까, 옆에 붙일까"처럼 **그릴지 말지**는 못 정해서 JS로 본다.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Tailwind `lg`(1024px)와 같은 경계. */
export const WIDE_SCREEN_QUERY = "(min-width: 1024px)";
