/**
 * 문장 옆에 붙는 동그란 이모지 버튼(발음·복사·선생님에게 묻기)의 공용 클래스.
 * 세 버튼이 나란히 놓이므로 크기·색이 어긋나지 않도록 한 곳에서 관리한다 —
 * 같은 자리에 버튼을 하나 더 만들 때도 이걸 쓸 것.
 */
const SIZE_CLASS = {
  sm: "h-7 w-7 text-sm",
  md: "h-10 w-10 text-lg",
} as const;

const TONE_CLASS = {
  /** 흰/회색 배경 위(예문 카드, AI 말풍선) */
  default: "bg-gray-100 text-gray-500 hover:bg-primary/10 hover:text-primary active:bg-primary/20",
  /** 컬러 배경 위(회화 페이지의 내 말풍선처럼 primary 배경) */
  onPrimary: "bg-white/20 text-white hover:bg-white/30 active:bg-white/40",
} as const;

export type IconButtonSize = keyof typeof SIZE_CLASS;
export type IconButtonTone = keyof typeof TONE_CLASS;

export function iconButtonClass(
  size: IconButtonSize = "sm",
  tone: IconButtonTone = "default",
  className = ""
): string {
  return `inline-flex shrink-0 items-center justify-center rounded-full align-middle transition-colors ${SIZE_CLASS[size]} ${TONE_CLASS[tone]} ${className}`;
}

/**
 * 목록 항목의 "삭제" 같은 작은 글자 버튼. 단어장의 단어·문장 목록이 같은 모양을 쓰므로
 * 한 곳에 둔다 — 같은 성격의 버튼을 또 만들면 이걸 쓸 것.
 */
export const dangerChipClass = "rounded-full bg-danger/10 px-2 py-1 text-xs text-danger";
