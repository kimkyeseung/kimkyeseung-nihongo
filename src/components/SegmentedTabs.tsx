/**
 * 알약 모양 세그먼트 탭(오십음도 히라가나/가타카나, 한자 급수, 단어장 단어/문장·복습/목록).
 *
 * 네 자리가 같은 마크업을 복붙하고 있어서 하나로 모았다. **375px에서 자리가 빠듯한 UI라**
 * (하단 네비 7칸과 같은 이야기) 여백·글자 크기를 한 곳에서 관리하는 편이 안전하다.
 *
 * 항목이 화면 너비를 넘길 수 있으면 `scrollable`을 준다 — 한자 급수처럼 6칸짜리가 그렇다.
 */
function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  fill = false,
  className = "",
}: {
  options: readonly { key: T; label: string; /** 라벨 옆의 작은 숫자(개수 등). */ hint?: string }[];
  value: T;
  onChange: (key: T) => void;
  /** 항목이 많아 가로로 넘칠 수 있는 경우(한자 급수). */
  scrollable?: boolean;
  /** 각 칸이 너비를 n등분하도록(단어장 단어/문장 탭). */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex rounded-full bg-gray-100 p-1 ${scrollable ? "gap-1 overflow-x-auto" : ""} ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              scrollable ? "min-w-14 shrink-0" : ""
            } ${fill ? "flex-1" : ""} ${active ? "bg-primary text-white" : "text-gray-500"}`}
          >
            {opt.label}
            {opt.hint && (
              <span className={`ml-1 text-xs ${active ? "opacity-80" : "opacity-60"}`}>
                {opt.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
