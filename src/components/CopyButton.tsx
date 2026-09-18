import { useEffect, useState } from "react";
import { iconButtonClass } from "./iconButtonClass";

/**
 * 클립보드에 복사한다. `navigator.clipboard`는 권한/보안 컨텍스트에 따라 거부되는 경우가
 * 있어서(실제로 이 프로젝트 미리보기 브라우저에서 NotAllowedError가 난다) 실패하면 임시
 * textarea + execCommand("copy")로 한 번 더 시도한다. execCommand는 폐기 예정이지만
 * 아직 모든 브라우저가 지원하고, 권한 없이 사용자 제스처만으로 동작한다.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 아래 폴백으로 넘어간다.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 문장을 클립보드에 복사하는 버튼(이모지만). 누르면 잠깐 ✅로 바뀌어 복사됐다는 걸 알린다.
 * 복사가 끝내 실패하면 아이콘을 바꾸지 않는다 — 복사 실패로 에러 다이얼로그를 띄울 만한
 * 일은 아니고, 아이콘이 그대로면 다시 눌러볼 수 있다.
 */
function CopyButton({ text, label = "복사", className = "" }: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!text.trim()) return null;

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation(); // 문장 자체가 클릭 가능한 화면(ClickableSentence)에서 같이 눌리지 않게
        if (await copyToClipboard(text)) setCopied(true);
      }}
      aria-label={label}
      title={label}
      className={iconButtonClass("sm", "default", className)}
    >
      <span aria-hidden="true">{copied ? "✅" : "📋"}</span>
    </button>
  );
}

export default CopyButton;
