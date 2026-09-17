import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import AssetLoadingBar from "../components/AssetLoadingBar";
import { useAssetPreload } from "../hooks/useAssetPreload";
import { useGamificationStore } from "../stores/gamificationStore";

const HERO_IMAGE_SRC = `${import.meta.env.BASE_URL}hero.png`;

const FEATURES = [
  {
    to: "/gojuon",
    icon: "あ",
    title: "오십음도",
    desc: "히라가나·가타카나를 눌러 듣고 따라 읽기",
  },
  {
    to: "/dictionary",
    icon: "📖",
    title: "사전",
    desc: "한자·가나·로마자·뜻 어느 쪽으로 검색해도 OK",
  },
  {
    to: "/kanji",
    icon: "漢",
    title: "한자",
    desc: "JLPT 급수별 획순 애니메이션과 읽기 퀴즈",
  },
  {
    to: "/wordbook",
    icon: "🗂️",
    title: "단어장",
    desc: "스와이프로 복습하는 나만의 단어 카드",
  },
  {
    to: "/conversation",
    icon: "💬",
    title: "회화",
    desc: "상황별 롤플레이와 문법 교정",
  },
  {
    to: "/writing",
    icon: "✏️",
    title: "작문",
    desc: "쓴 문장을 고쳐주고 어디가 달라졌는지 표시",
  },
] as const;

const POINTS = [
  {
    icon: "🔒",
    title: "서버 없이 내 브라우저 안에서",
    desc: "회화·작문 첨삭은 Chrome의 온디바이스 AI(Prompt API)가 처리합니다. 입력한 문장이 어디로도 전송되지 않습니다.",
  },
  {
    icon: "📚",
    title: "사전 정보는 AI가 지어내지 않습니다",
    desc: "뜻풀이·읽기·JLPT 급수·획순은 JMDict·KANJIDIC2·KanjiVG를 가공한 정적 데이터에서만 가져옵니다.",
  },
  {
    icon: "🔥",
    title: "매일 조금씩, 스트릭과 뱃지로",
    desc: "학습을 마칠 때마다 XP가 쌓이고 연속 학습일이 올라갑니다. 조건을 채우면 뱃지를 얻습니다.",
  },
] as const;

function HomePage() {
  const preload = useAssetPreload();
  const streak = useGamificationStore((s) => s.streak);
  const xp = useGamificationStore((s) => s.xp);
  const returning = xp > 0;

  return (
    <div className="min-h-svh bg-[#faf4e4]">
      {/* 그림의 배경색이 페이지 배경(#faf4e4)과 정확히 같아서 테두리·모서리 없이 좌우 여백
          바깥까지 꽉 채워도 경계가 보이지 않는다 — 그림이 배경에 그대로 이어지는 효과. */}
      <motion.img
        src={HERO_IMAGE_SRC}
        alt="김계승 일본어 — 마네키네코와 후지산, 히라가나 말풍선이 그려진 대문 그림"
        width={1536}
        height={1024}
        className="mx-auto block w-full max-w-3xl"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-6 sm:px-6 sm:pb-10">
        <section className="text-center">
          <h1 className="text-3xl text-primary sm:text-4xl">혼자서, 매일 조금씩 일본어</h1>
          <p className="mt-2 text-gray-600">
            오십음도부터 한자 획순, 회화와 작문 첨삭까지.
            <br className="hidden sm:inline" /> 설치도 로그인도 없이 브라우저 하나로 하는 일본어
            학습.
          </p>
          {returning && (
            <p className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-sm text-gray-500">
              🔥 {streak}일 연속 · ⭐ {xp} XP — 다시 오셨네요!
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <AssetLoadingBar {...preload} />

          {/* 로딩이 끝나지 않아도 넘어갈 수 있게 둔다 — 못 받은 데이터는 그 페이지에서 다시 받는다. */}
          <Link
            to="/gojuon"
            className={`btn-press flex items-center justify-center rounded-2xl px-6 py-4 text-xl text-white ${
              preload.finished ? "animate-pop bg-primary" : "bg-primary/60"
            }`}
            style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.25)" }}
          >
            {preload.finished
              ? returning
                ? "이어서 학습하기"
                : "학습 시작하기"
              : "먼저 시작하기 (계속 받는 중)"}
          </Link>
        </section>

        <section>
          <h2 className="text-lg text-gray-700">무엇을 할 수 있나요</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.to}>
                <Link
                  to={f.to}
                  className="btn-press flex h-full items-start gap-3 rounded-2xl border-4 border-white bg-white p-4 hover:border-primary/30"
                  style={{ ["--btn-shadow" as string]: "rgb(0 0 0 / 0.08)" }}
                >
                  <span className="text-2xl leading-none font-ja">{f.icon}</span>
                  <span className="flex-1">
                    <span className="block text-gray-800">{f.title}</span>
                    <span className="mt-0.5 block text-sm text-gray-500">{f.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg text-gray-700">이런 점이 다릅니다</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3 rounded-2xl bg-white/70 p-4">
                <span className="text-2xl leading-none">{p.icon}</span>
                <div>
                  <p className="text-gray-800">{p.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className="pb-2 text-center text-xs text-gray-400">
          <p>
            사전 데이터: JMDict / KANJIDIC2 (EDRDG, CC BY-SA) · 획순: KanjiVG (CC BY-SA)
          </p>
          <Link to="/about" className="mt-1 inline-block text-info hover:underline">
            데이터 출처 및 라이선스 자세히 보기
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default HomePage;
