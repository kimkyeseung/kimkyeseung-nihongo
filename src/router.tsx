import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "./components/Layout";

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
const AboutPage = lazy(() => import("./pages/AboutPage"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/gojuon" replace /> },
      { path: "conversation", element: <ConversationPage /> },
      { path: "gojuon", element: <GojuonPage /> },
      { path: "dictionary", element: <DictionaryPage /> },
      { path: "dictionary/:id", element: <WordDetailPage /> },
      { path: "wordbook", element: <WordbookPage /> },
      { path: "kanji", element: <KanjiPage /> },
      { path: "writing", element: <WritingPage /> },
      { path: "about", element: <AboutPage /> },
    ],
  },
]);
