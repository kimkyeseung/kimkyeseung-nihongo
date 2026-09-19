import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useLearnerMemoryStore } from "./stores/learnerMemoryStore";

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

  return (
    <>
      <RouterProvider router={router} />
      <Analytics />
    </>
  );
}

export default App;
