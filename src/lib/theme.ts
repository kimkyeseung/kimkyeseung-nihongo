// 화면 모드(밝게/어둡게/시스템). 색 자체는 index.css가 `:root[data-theme="dark"]`로 뒤집고, 여기서는
// `<html data-theme>`만 정한다.
//
// **첫 페인트는 index.html의 인라인 스크립트가 맡는다** — React가 뜬 뒤에 붙이면 어두운 모드
// 사용자에게 흰 화면이 한 번 번쩍인다. 그 스크립트는 이 파일을 import할 수 없어서 같은 판단
// (저장 키 `appearance`, 값 모양)을 손으로 한 번 더 적어 뒀다 — **키나 모양을 바꾸면 둘 다 고칠 것.**

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "appearance";

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(pref, systemPrefersDark());
}

/**
 * "시스템"을 고른 동안 OS 설정이 바뀌면(저녁에 자동 전환 등) 따라간다. 해제 함수를 돌려준다.
 */
export function followSystemTheme(pref: ThemePreference): () => void {
  applyTheme(pref);
  if (pref !== "system" || typeof matchMedia !== "function") return () => {};
  const query = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyTheme(pref);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
