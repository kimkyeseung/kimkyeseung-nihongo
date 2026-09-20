import { lazy } from "react";
import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import { wordPath } from "./lib/wordLink";
// 대문은 앱의 첫 화면이라 lazy로 나누면 오히려 청크 왕복이 한 번 더 생긴다. 대신 이 페이지가
// 쓰는 큰 데이터는 전부 preloadAssets.ts의 동적 import 뒤에 있어서 진입 청크는 그대로 가볍다.
import HomePage from "./pages/HomePage";

// 페이지별로 코드 스플리팅한다. 특히 dictionary.json(2.9MB)·kanjivg.json(1.9MB) 같은
// 큰 정적 데이터가 해당 페이지를 실제로 방문하기 전까지는 아예 다운로드되지 않도록 하는 게
// 목적이다 — 이 파일들을 참조하는 lib(dictionary.ts, kanjivg.ts 등)이 오직 특정 페이지에서만
// import되므로, 그 페이지를 lazy()로 분리하면 데이터도 자동으로 같은 청크로 분리된다.
const ConversationPage = lazy(() => import("./pages/ConversationPage"));
const GojuonPage = lazy(() => import("./pages/GojuonPage"));
const DictionaryPage = lazy(() => import("./pages/DictionaryPage"));
const WordDetailPage = lazy(() => import("./pages/WordDetailPage"));
const WordbookPage = lazy(() => import("./pages/WordbookPage"));
const KanjiPage = lazy(() => import("./pages/KanjiPage"));
const WritingPage = lazy(() => import("./pages/WritingPage"));
const TeacherPage = lazy(() => import("./pages/TeacherPage"));
const MemoryPage = lazy(() => import("./pages/MemoryPage"));
const CurriculumPage = lazy(() => import("./pages/CurriculumPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const PromptApiDiagnosticsPage = lazy(() => import("./pages/PromptApiDiagnosticsPage"));

/**
 * 옛 주소를 새 주소로 넘긴다. `replace`라 뒤로 가기가 이 리다이렉트로 되돌아오지 않는다.
 * 여기는 lazy 청크가 아니라 진입 청크에 들어가도 괜찮다 — 컴포넌트가 이것뿐이다.
 */
function LegacyWordRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? wordPath(id) : "/dictionary"} replace />;
}

export const router = createBrowserRouter([
  // 대문(`/`)은 헤더·하단 네비게이션이 없는 전체 화면이라 Layout 밖에 둔다.
  { path: "/", element: <HomePage /> },
  {
    // path 없는 레이아웃 라우트 — URL에는 아무것도 더하지 않고 자식들만 감싼다.
    element: <Layout />,
    children: [
      { path: "conversation", element: <ConversationPage /> },
      { path: "gojuon", element: <GojuonPage /> },
      { path: "dictionary", element: <DictionaryPage /> },
      // 단어 상세는 **사전의 하위 화면이 아니다** — 단어장·회화·선생님·한자·오십음도에서도
      // 들어오므로 주소도 사전 밑에 두지 않는다(lib/wordLink.ts 주석).
      { path: "word/:id", element: <WordDetailPage /> },
      // 예전 주소(`/dictionary/:id`)로 저장해둔 북마크·공유 링크를 깨뜨리지 않는다.
      { path: "dictionary/:id", element: <LegacyWordRedirect /> },
      { path: "wordbook", element: <WordbookPage /> },
      { path: "kanji", element: <KanjiPage /> },
      { path: "writing", element: <WritingPage /> },
      { path: "teacher", element: <TeacherPage /> },
      { path: "memory", element: <MemoryPage /> },
      { path: "curriculum", element: <CurriculumPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "diagnostics", element: <PromptApiDiagnosticsPage /> },
    ],
  },
]);
