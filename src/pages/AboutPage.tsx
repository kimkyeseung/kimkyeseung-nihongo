import { Link } from "react-router-dom";

const SOURCES = [
  {
    name: "JMDict / JMDict_Extended",
    desc: "사전 뜻풀이·읽기·JLPT 급수·후리가나",
    license: "CC BY-SA (EDRDG)",
    url: "https://github.com/Bluskyo/JMDict_Extended",
  },
  {
    name: "한국어 위키낱말사전",
    desc: "단어의 한국어 뜻풀이 (kaikki.org 가공본)",
    license: "CC BY-SA 3.0",
    url: "https://kaikki.org/kowiktionary/",
  },
  {
    name: "KANJIDIC2",
    desc: "한자 음독·훈독·뜻·획수",
    license: "CC BY-SA (EDRDG)",
    url: "https://github.com/scriptin/jmdict-simplified",
  },
  {
    name: "AnchorI/jlpt-kanji-dictionary",
    desc: "한자 JLPT 급수 매칭",
    license: "원 저장소 라이선스 참고",
    url: "https://github.com/AnchorI/jlpt-kanji-dictionary",
  },
  {
    name: "KanjiVG",
    desc: "한자 획순 벡터 경로",
    license: "CC BY-SA 3.0",
    url: "https://github.com/KanjiVG/kanjivg",
  },
];

function AboutPage() {
  return (
    <div className="p-4 sm:p-6">
      <Link to="/gojuon" className="text-info">
        ← 돌아가기
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-4xl">🗻</span>
        <div>
          <h2 className="text-xl text-primary">김계승 일본어</h2>
          {/* **"Chrome 온디바이스 AI"라고만 쓰지 말 것.** 엔진은 둘이고(내장 Prompt API,
              직접 받는 Gemma 4) Chrome 전용 앱이 아니다 — aiCapability.ts의 안내 흐름과
              같은 이야기다. */}
          <p className="text-sm text-gray-400">브라우저 안에서 도는 AI로 공부하는 일본어 학습 웹앱</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        서비스 출시용이 아닌 개인 프로젝트입니다. 서버 없이 브라우저에서만 동작하며, 회화 연습과
        작문 첨삭 같은 생성형 기능에는 브라우저 안에서 도는 AI(Chrome 내장 Prompt API 또는 직접
        내려받은 Gemma 4)를 사용합니다. 입력한 문장도 학습 기록도 이 기기를 벗어나지 않습니다.
        사전 뜻풀이·읽기·JLPT 급수·한자 정보처럼 정답이 정해진 내용은 AI가 만들지 않고, 아래 공개
        데이터셋을 가공한 정적 데이터에서만 가져옵니다.
      </p>

      <h3 className="mt-6 text-sm font-bold text-gray-500">데이터 출처</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {SOURCES.map((s) => (
          <li key={s.name} className="rounded-2xl border-2 border-gray-100 bg-white p-3">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-info hover:underline"
            >
              {s.name}
            </a>
            <p className="mt-0.5 text-sm text-gray-500">{s.desc}</p>
            <p className="mt-0.5 text-xs text-gray-400">{s.license}</p>
          </li>
        ))}
      </ul>

      {/* 커리큘럼은 위 목록의 데이터셋이 아니라 직접 정리한 자료라 카드로 묶지 않고 따로 적는다.
          목표치가 공식 수치가 아니라는 점은 /curriculum 하단에도 같은 취지로 적혀 있다. */}
      <h3 className="mt-6 text-sm font-bold text-gray-500">학습 로드맵</h3>
      <p className="mt-2 rounded-2xl border-2 border-gray-100 bg-white p-3 text-sm text-gray-500">
        급수별 단원 구성과 문법 포인트는 위 데이터셋이 아니라 직접 정리한 자료입니다.{" "}
        <a
          href="https://www.jlpt.jp/e/about/levelsummary.html"
          target="_blank"
          rel="noreferrer"
          className="text-info hover:underline"
        >
          JLPT 공식 급수 기준
        </a>
        ,{" "}
        <a href="https://jlptsensei.com" target="_blank" rel="noreferrer" className="text-info hover:underline">
          jlptsensei
        </a>
        (문법 목록),{" "}
        <a
          href="https://migaku.com/blog/japanese/jlpt-vocabulary-lists"
          target="_blank"
          rel="noreferrer"
          className="text-info hover:underline"
        >
          migaku
        </a>
        (단어·한자 수)를 참고했습니다.
        <span className="mt-1 block text-xs text-gray-400">
          단어·한자 목표치는 JLPT가 공식 발표하는 수치가 아니라 통용되는 추정치이고, 문법도 각
          급수의 핵심만 추린 것이라 실제 시험 범위는 더 넓습니다.
        </span>
      </p>

      <p className="mt-4 rounded-2xl bg-gray-50 p-3 text-xs text-gray-400">
        사전 데이터: JMDict/KANJIDIC (EDRDG, CC BY-SA) · 한국어 뜻: 한국어 위키낱말사전 (CC BY-SA) ·
        JLPT 태그: JMDict_Extended,
        AnchorI/jlpt-kanji-dictionary · 획순: KanjiVG (CC BY-SA)
      </p>
    </div>
  );
}

export default AboutPage;
