import { motion } from "framer-motion";

interface Props {
  /** 0~100 */
  percent: number;
  label: string;
  /** 진행 중일 때만 줄무늬가 흐른다 */
  active?: boolean;
  className?: string;
}

/** 대문의 학습 데이터 로딩과 Gemma 모델 다운로드가 같이 쓰는 진행률 바. */
function ProgressBar({ percent, label, active = true, className = "" }: Props) {
  return (
    <div
      className={`h-4 overflow-hidden rounded-full bg-gray-100 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* 바 안쪽에서 계속 흐르는 줄무늬 — 큰 파일 하나를 받는 동안에도 멈춘 게 아니라는 표시 */}
        {active && (
          <motion.div
            className="h-full w-full bg-[repeating-linear-gradient(115deg,transparent_0_10px,rgb(255_255_255/0.35)_10px_20px)]"
            animate={{ backgroundPositionX: ["0px", "40px"] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        )}
      </motion.div>
    </div>
  );
}

export default ProgressBar;
