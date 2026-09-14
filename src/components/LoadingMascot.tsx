import { motion } from "framer-motion";

/** LLM 응답 대기 등에 쓰는 귀엽게 통통 튀는 로딩 인디케이터. */
function LoadingMascot({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <motion.span
        className="text-xl"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
      >
        🗻
      </motion.span>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export default LoadingMascot;
