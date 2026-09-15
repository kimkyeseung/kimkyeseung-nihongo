// 온디바이스 Prompt API는 구글이 Chrome에만 Gemini Nano 모델을 배포하기 때문에,
// 크로미움 기반이라도 Whale/Edge/Opera 같은 다른 브랜드 브라우저에서는 동작하지 않는다.
// User-Agent 문자열의 브랜드 토큰으로 "진짜 Chrome"인지 먼저 구분한다.
export interface BrowserInfo {
  name: string;
  version: string | null;
  isGenuineChrome: boolean;
}

const KNOWN_FORKS: { token: string; name: string }[] = [
  { token: "Whale/", name: "Whale(웨일)" },
  { token: "Edg/", name: "Microsoft Edge" },
  { token: "OPR/", name: "Opera" },
  { token: "SamsungBrowser/", name: "Samsung Internet" },
  { token: "YaBrowser/", name: "Yandex Browser" },
  { token: "Brave/", name: "Brave" },
  { token: "Firefox/", name: "Firefox" },
  { token: "Safari/", name: "Safari" },
];

export function detectBrowser(): BrowserInfo {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // Safari/Firefox의 UA에는 "Chrome/"이 안 들어가므로 먼저 걸러낸다.
  for (const fork of KNOWN_FORKS) {
    if (fork.token !== "Safari/" && ua.includes(fork.token)) {
      const version = ua.match(new RegExp(`${fork.token.replace("/", "\\/")}([\\d.]+)`))?.[1] ?? null;
      return { name: fork.name, version, isGenuineChrome: false };
    }
  }

  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  if (chromeMatch) {
    return { name: "Chrome", version: chromeMatch[1], isGenuineChrome: true };
  }

  if (ua.includes("Safari/")) {
    const version = ua.match(/Version\/([\d.]+)/)?.[1] ?? null;
    return { name: "Safari", version, isGenuineChrome: false };
  }

  return { name: "알 수 없는 브라우저", version: null, isGenuineChrome: false };
}

const MIN_CHROME_MAJOR_VERSION = 127;

/** Chrome이 아니면 버전 판단 자체가 무의미하므로 null을 반환한다. */
export function isChromeVersionSufficient(info: BrowserInfo): boolean | null {
  if (!info.isGenuineChrome || !info.version) return null;
  const major = parseInt(info.version.split(".")[0], 10);
  if (Number.isNaN(major)) return null;
  return major >= MIN_CHROME_MAJOR_VERSION;
}
