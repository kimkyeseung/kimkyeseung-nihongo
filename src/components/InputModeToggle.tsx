import type { InputScript } from "../hooks/useScriptInput";

const OPTIONS: { script: InputScript; glyph: string; label: string; hint: string }[] = [
  {
    script: "default",
    glyph: "가",
    label: "한/영",
    hint: "한글·영어는 키보드의 한/영 키로 그대로 전환됩니다",
  },
  {
    script: "ja",
    glyph: "あ",
    label: "일본어",
    hint: "로마자로 치면 히라가나로 바뀝니다 (ka → か)",
  },
];

/**
 * 입력창의 문자 모드를 고르는 토글 (선생님 질문창, 회화 이름칸).
 *
 * **한글과 영어를 따로 두지 않는다** — 한/영 전환은 OS 입력기가 이미 하는 일이라 앱이 버튼으로
 * 흉내 낼 게 없다. 앱이 실제로 바꿀 수 있는 건 "로마자를 히라가나로 바꿔줄까 말까"뿐이고,
 * 그래서 버튼도 둘이다(useScriptInput.ts 주석 참고).
 */
function InputModeToggle({
  value,
  onChange,
  className = "",
}: {
  value: InputScript;
  onChange: (script: InputScript) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="입력 문자 선택" className={`flex gap-1 ${className}`}>
      {OPTIONS.map((o) => {
        const active = value === o.script;
        return (
          <button
            key={o.script}
            type="button"
            onClick={() => onChange(o.script)}
            // 눌러도 입력창의 포커스를 뺏지 않는다 — 모드를 바꾸는 건 타이핑 도중에 하는
            // 일이라, 누를 때마다 커서가 빠지면 다시 클릭해서 이어 쳐야 한다.
            // (mousedown의 기본 동작이 포커스 이동이라 그걸 막는다. onClick은 그대로 돈다.)
            onMouseDown={(e) => e.preventDefault()}
            aria-pressed={active}
            title={o.hint}
            // 터치 영역을 36px 이상으로 잡는다 — 이 프로젝트의 "큰 터치 영역" 디자인 톤.
            className={`flex min-h-9 items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
              active ? "bg-primary/10 font-bold text-primary" : "bg-gray-50 text-gray-400"
            }`}
          >
            <span className="text-sm leading-none font-ja">{o.glyph}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default InputModeToggle;
