/**
 * 클립보드에 복사한다. `navigator.clipboard`는 권한/보안 컨텍스트에 따라 거부되는 경우가
 * 있어서(실제로 이 프로젝트 미리보기 브라우저에서 NotAllowedError가 난다) 실패하면 임시
 * textarea + `execCommand("copy")`로 한 번 더 시도한다. execCommand는 폐기 예정이지만
 * 아직 모든 브라우저가 지원하고, 권한 없이 사용자 제스처만으로 동작한다.
 *
 * 복사를 새로 붙일 때 `navigator.clipboard`를 직접 부르지 말고 이 함수를 쓸 것.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
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
