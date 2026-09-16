import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const DOT_FRAMES = [".", "..", "..."];

/** LLM 응답 대기 등에 쓰는 귀엽게 통통 튀는 로딩 인디케이터. */
function LoadingMascot({ label }: { label?: string }) {
  // "." -> ".." -> "..." -> "."로 반복되는 온점 애니메이션. 프레임마다 길이가 달라져서
  // 옆 글자가 들썩이지 않도록 고정폭(w-4)에 왼쪽 정렬로 렌더링한다.
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotIndex((i) => (i + 1) % DOT_FRAMES.length);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 text-gray-400">
      <motion.span
        className="text-xl"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
      >
        🗻
      </motion.span>
      <span className="inline-block w-4 text-left font-bold">{DOT_FRAMES[dotIndex]}</span>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export default LoadingMascot;
