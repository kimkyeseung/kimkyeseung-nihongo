/**
 * chrome://로 시작하는 내부 설정 페이지 링크. 새 탭으로 열도록 target="_blank"를 쓴다.
 * (참고: Chrome은 보안상 웹페이지의 chrome:// 링크 클릭을 막을 수 있다 — 그 경우 사용자가
 * 링크 텍스트를 직접 복사해 주소창에 붙여넣어야 한다. 그래도 코드로 시도하는 게 안 하는
 * 것보다 낫고, 일부 환경/확장에서는 정상 동작한다.)
 */
function ChromeLink({ path, className = "font-mono" }: { path: string; className?: string }) {
  return (
    <a
      href={`chrome://${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-info underline ${className}`}
    >
      chrome://{path}
    </a>
  );
}

export default ChromeLink;
