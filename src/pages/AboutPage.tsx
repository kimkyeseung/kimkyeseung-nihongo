import { Link } from "react-router-dom";

const SOURCES = [
  {
    name: "JMDict / JMDict_Extended",
    desc: "사전 뜻풀이·읽기·JLPT 급수·후리가나",
    license: "CC BY-SA (EDRDG)",
    url: "https://github.com/Bluskyo/JMDict_Extended",
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
          <p className="text-sm text-gray-400">Chrome 온디바이스 AI 기반 일본어 학습 웹앱</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        서비스 출시용이 아닌 개인 프로젝트입니다. 서버 없이 브라우저에서만 동작하며, 회화 연습과
        작문 첨삭 같은 생성형 기능에는 Chrome의 온디바이스 AI(Prompt API)를 사용합니다. 사전
        뜻풀이·읽기·JLPT 급수·한자 정보처럼 정답이 정해진 내용은 AI가 만들지 않고, 아래 공개
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

      <p className="mt-4 rounded-2xl bg-gray-50 p-3 text-xs text-gray-400">
        사전 데이터: JMDict/KANJIDIC (EDRDG, CC BY-SA) · JLPT 태그: JMDict_Extended,
        AnchorI/jlpt-kanji-dictionary · 획순: KanjiVG (CC BY-SA)
      </p>
    </div>
  );
}

export default AboutPage;
