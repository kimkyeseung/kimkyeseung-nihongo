import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { iconButtonClass, type IconButtonSize, type IconButtonTone } from "./iconButtonClass";

export interface ActionMenuItem {
  id: string;
  /** 이모지 하나. 목록에서 글자 앞에 붙는다. */
  icon: string;
  label: string;
  /**
   * 누르면 실행된다. `false`를 돌려주면 `doneLabel`을 건너뛴다(복사 실패처럼 결과를
   * 알릴 게 없는 경우).
   */
  onSelect: () => void | boolean | Promise<void | boolean>;
  /** 누른 뒤 잠깐 이 문구로 바뀌었다가 닫힌다. 없으면 바로 닫힌다. */
  doneLabel?: string;
}

/** `doneLabel`을 보여주는 시간. 읽을 수는 있되 손을 멈추게 하지는 않을 만큼. */
const DONE_LABEL_MS = 900;
/** 메뉴와 화면 가장자리 사이에 남길 여백. */
const VIEWPORT_MARGIN = 8;

function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

/**
 * ⋮ 버튼을 누르면 뜨는 동작 목록(케밥 메뉴).
 *
 * **팝업을 `createPortal`로 `document.body`에 그린다.** 이 메뉴가 붙는 자리는 전부
 * `overflow-y-auto`인 대화 영역 안(회화 말풍선, 선생님 답변 칩, 예문 카드)이라 그냥
 * `absolute`로 띄우면 컨테이너 경계에서 잘린다. body로 빼면 조상의 overflow도, 페이지 전환
 * 애니메이션이 거는 transform도 영향을 주지 않는다(transform이 걸린 조상이 있으면 `fixed`가
 * 뷰포트가 아니라 그 조상 기준이 된다 — AnimatedOutlet이 정확히 그렇다).
 *
 * 대신 스크롤하면 팝업만 제자리에 남으므로 **스크롤이 시작되면 닫는다.**
 */
function ActionMenu({
  items,
  label = "더 보기",
  size = "sm",
  tone = "default",
  className = "",
}: {
  items: ActionMenuItem[];
  /** 트리거 버튼의 스크린리더 설명. 한 화면에 여러 개면 무엇에 대한 메뉴인지 구분해서 줄 것. */
  label?: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPosition(null);
    setDoneId(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // 타이머가 살아있는 채로 언마운트되면 사라진 컴포넌트에 setState한다.
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  /**
   * 팝업을 다 그린 뒤에 위치를 잡는다. 실제 크기를 알아야 화면 밖으로 나가는지 판단할 수
   * 있어서 `useLayoutEffect`다 — `useEffect`면 잘못된 자리에 한 프레임 보였다가 튄다.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const anchor = trigger.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();

    // 아래에 자리가 없으면 위로 뒤집는다.
    const below = anchor.bottom + 4;
    const top =
      below + height > window.innerHeight - VIEWPORT_MARGIN ? anchor.top - height - 4 : below;
    // 오른쪽 끝을 트리거에 맞추되 화면 밖으로 나가지 않게 가둔다.
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.right - width),
      window.innerWidth - width - VIEWPORT_MARGIN
    );

    setPosition({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [open]);

  // 바깥 클릭 · Escape · 스크롤 · 리사이즈면 닫는다.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    // 스크롤은 capture로 듣는다 — 실제로 스크롤되는 건 페이지가 아니라 안쪽 컨테이너다.
    function onScrollOrResize() {
      close(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close]);

  async function handleSelect(item: ActionMenuItem) {
    const result = await item.onSelect();
    if (item.doneLabel && result !== false) {
      setDoneId(item.id);
      closeTimerRef.current = setTimeout(() => close(false), DONE_LABEL_MS);
      return;
    }
    close(false);
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    }
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // 문장 자체가 클릭 가능한 화면(ClickableSentence)에서 같이 눌리지 않게
        onClick={(e) => {
          e.stopPropagation();
          setActiveIndex(0);
          setOpen((v) => !v);
        }}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={iconButtonClass(size, tone, className)}
      >
        <KebabIcon />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={handleMenuKeyDown}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "fixed",
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                // 위치를 재기 전 한 프레임을 (0,0)에서 보여주지 않는다.
                visibility: position ? "visible" : "hidden",
              }}
              className="z-40 min-w-44 overflow-hidden rounded-2xl border-2 border-gray-100 bg-white py-1 shadow-lg"
            >
              {items.map((item, i) => {
                const done = doneId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    // 목록이 뜨자마자 키보드로 오갈 수 있도록 첫 항목에 포커스를 준다.
                    autoFocus={i === 0}
                    onFocus={() => setActiveIndex(i)}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSelect(item);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm whitespace-nowrap ${
                      activeIndex === i ? "bg-primary/10 text-primary" : "text-gray-700"
                    }`}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {done ? "✅" : item.icon}
                    </span>
                    <span className="font-mixed">{done ? item.doneLabel : item.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export default ActionMenu;
