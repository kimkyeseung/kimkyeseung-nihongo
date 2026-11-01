import { useEffect } from "react";

/**
 * 복습 카드의 키보드 조작 — Space/Enter로 뜻 보기, ←는 모르겠어요, →는 알아요.
 * PC에서 카드를 마우스로 끌어 넘기는 건 손목만 아프다. 단어 칸·문장 칸 복습이 같이 쓴다.
 *
 * 건너뛰는 경우: 입력창에 쓰는 중(그룹 이름), 시트·다이얼로그가 떠 있음(단어 뜻·한자 상세 —
 * 그쪽 키다), 버튼·링크에 포커스가 있을 때의 Space/Enter(그건 그 버튼을 누르는 키라, 받으면 두 번
 * 일어난다), 키를 누르고 있어 반복되는 이벤트(한 번에 여러 장이 넘어간다).
 */
export function useReviewKeys({
  enabled,
  revealed,
  answerBeforeReveal,
  onReveal,
  onAnswer,
}: {
  enabled: boolean;
  revealed: boolean;
  /** 뒤집기 전에도 ←/→로 답할 수 있는가(단어 카드는 앞면에서도 스와이프된다 — 문장은 버튼이 뒤집은 뒤에만 있다). */
  answerBeforeReveal: boolean;
  onReveal: () => void;
  onAnswer: (know: boolean) => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[data-modal]")) return;

      if (e.key === " " || e.key === "Enter") {
        if (target?.closest("button, a")) return;
        if (revealed) return;
        e.preventDefault();
        onReveal();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!revealed && !answerBeforeReveal) return;
        e.preventDefault();
        onAnswer(e.key === "ArrowRight");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, revealed, answerBeforeReveal, onReveal, onAnswer]);
}

/** 넓은 화면에서 복습 카드 아래 붙이는 단축키 안내. */
export const REVIEW_KEYS_HINT = "Space 뜻 보기 · ← 모르겠어요 · → 알아요";
