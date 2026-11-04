import { motion } from "framer-motion";
import { Link } from "react-router-dom";

/**
 * 선생님 페이지에 처음 온 사람에게 보여주는 환영 카드(`isNewTeacherLearner`). 수준을 모르는 채로
 * "오늘은 뭐가 궁금하세요?"라고 물으면 처음 온 사람은 뭘 물어야 할지 모른다 — 실력 진단을 먼저 권한다.
 * 진단은 AI 없이 돌아가므로 AI를 못 쓰는 브라우저의 안내 화면에도 같이 띄운다.
 */
function TeacherWelcomeCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md rounded-3xl border-2 border-primary/20 bg-white p-5 text-center"
    >
      <span className="text-5xl">🧑‍🏫</span>
      <h3 className="mt-2 text-xl text-primary">처음 오셨군요, 반가워요!</h3>
      <p className="mt-2 text-sm text-gray-600">
        일본어 실력을 먼저 진단해 보세요. 결과에 맞춰 시작할 단계와 설명 난이도를 맞춰 드릴게요.
      </p>
      <Link
        to="/level"
        className="btn-press mt-4 block rounded-2xl bg-primary py-3 font-bold text-white"
        style={{ ["--btn-shadow" as string]: "#3d9401" }}
      >
        🎯 10분 실력 진단 시작
      </Link>
      <Link to="/gojuon" className="mt-3 block py-1 font-mixed text-sm text-info">
        아직 히라가나도 몰라요 → 오십음도부터
      </Link>
    </motion.div>
  );
}

export default TeacherWelcomeCard;
