import { Fragment } from "react";
import ChromeLink from "../components/ChromeLink";

const CHROME_URL_RE = /(chrome:\/\/[\w\-/#]+)/g;

/** languageModelDiagnostics.ts가 만드는 안내 문자열 속 chrome://... 부분을 새 탭 링크로 바꾼다. */
export function renderWithChromeLinks(text: string) {
  return text.split(CHROME_URL_RE).map((part, i) =>
    part.startsWith("chrome://") ? (
      <ChromeLink key={i} path={part.slice("chrome://".length)} />
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
