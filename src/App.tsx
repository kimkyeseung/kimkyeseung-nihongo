import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import { useLearnerMemoryStore } from "./stores/learnerMemoryStore";
import { useAppearance } from "./stores/pageStateStore";
import { followSystemTheme } from "./lib/theme";
import { trackAppViewport } from "./lib/appViewport";

function App() {
  // 기억은 IndexedDB에 있어 읽는 데 한 박자 걸린다. 화면에 들어간 뒤에 읽기 시작하면
  // 선생님 시스템 프롬프트가 도중에 바뀌면서 세션이 새로 만들어지므로 미리 당겨둔다.
  //
  // **Layout이 아니라 여기서 부른다** — 대문(`/`)은 Layout 밖이라(router.tsx 참고) Layout에
  // 두면 대문의 "오늘의 학습" 카드가 기억을 영영 못 읽는다. 실패해도 조용히 넘어간다.
  const loadMemory = useLearnerMemoryStore((s) => s.load);
  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  // 화면 모드. 첫 페인트는 index.html의 인라인 스크립트가 이미 칠했고, 여기서는 바꿨을 때와
  // "시스템"일 때 OS 설정이 바뀌는 것을 따라간다. 대문도 덮어야 해서 역시 Layout이 아니라 여기다.
  const theme = useAppearance((s) => s.theme);
  useEffect(() => followSystemTheme(theme), [theme]);

  // 모바일 키보드가 올라오면 앱 높이를 보이는 영역에 맞춘다(appViewport.ts). 모달은 대문에서도 뜨므로
  // Layout이 아니라 여기다.
  useEffect(() => trackAppViewport(), []);

  return (
    <>
      <RouterProvider router={router} />
      {/* 서비스워커 등록도 여기서 한다 — Layout에 두면 대문(`/`)만 보고 간 사용자에게는
          서비스워커가 영영 안 깔려서, 설치한 앱을 오프라인으로 켜면 빈 화면이 된다(실제로
          그랬다 — 위 loadMemory와 같은 이유다). */}
      <PwaUpdatePrompt />
      <Analytics />
    </>
  );
}

export default App;
