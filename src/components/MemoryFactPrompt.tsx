import { AnimatePresence, motion } from "framer-motion";
import { FACT_KIND_EMOJI, FACT_KIND_LABEL } from "../lib/memoryExtraction";
import { useLearnerMemoryStore } from "../stores/learnerMemoryStore";

/**
 * 선생님과의 대화에서 모델이 건져 올린 "기억해둘 만한 사실"을 사용자에게 확인받는 칩.
 *
 * 왜 확인을 받는가: 온디바이스 모델은 없는 말을 지어내거나 선생님이 설명한 내용을 학습자
 * 이야기로 착각하는 일이 드물지 않다. 기억은 한 번 저장되면 **다음 대화에도 계속 따라오므로**,
 * 잘못 들어간 기억은 그 위에서 오래 쌓인다 — 그래서 저장은 하되 사용자가 수락하기 전까지는
 * 선생님 프롬프트에 넣지 않는다(learnerMemoryDb.ts의 MemoryFact.status 참고).
 *
 * 수락하지 않고 떠나도 사라지지 않는다 — pending 상태 그대로 IndexedDB에 남아 /memory에서
 * 다시 확인할 수 있다. 화면 하나에서만 볼 수 있게 두면 놓친 기억이 영영 묻힌다.
 */
function MemoryFactPrompt() {
  const facts = useLearnerMemoryStore((s) => s.facts);
  const confirmFact = useLearnerMemoryStore((s) => s.confirmFact);
  const rejectFact = useLearnerMemoryStore((s) => s.rejectFact);

  const pending = facts.filter((f) => f.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="pb-3">
      <p className="pb-1.5 text-xs text-gray-400">이걸 기억해둘까요?</p>
      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {pending.map((fact) => (
            <motion.div
              key={fact.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 rounded-2xl border-2 border-primary/20 bg-primary/5 px-3 py-2"
            >
              <span className="shrink-0 text-base">{FACT_KIND_EMOJI[fact.kind]}</span>
              <span className="min-w-0 flex-1 font-mixed text-sm text-gray-700">
                <span className="text-gray-400">{FACT_KIND_LABEL[fact.kind]} · </span>
                {fact.text}
              </span>
              <button
                onClick={() => confirmFact(fact.id)}
                className="btn-press shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white"
                style={{ ["--btn-shadow" as string]: "#3d9401" }}
              >
                기억하기
              </button>
              <button
                onClick={() => rejectFact(fact.id)}
                aria-label="기억하지 않기"
                title="기억하지 않기"
                className="shrink-0 px-1 text-xl leading-none text-gray-300"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MemoryFactPrompt;
