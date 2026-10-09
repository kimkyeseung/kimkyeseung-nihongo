import { useEffect, useRef, useState } from "react";
import LoadingMascot from "./LoadingMascot";
import { useAiModel } from "../hooks/useAiModel";
import { looksLikePromptLeak } from "../lib/promptSafety";
import {
  LEVEL_COMMENT_LEAK_REFERENCE,
  LEVEL_COMMENT_SYSTEM_PROMPT,
  buildLevelCommentPrompt,
  fallbackComment,
} from "../lib/levelTest/comment";
import type { LevelTestSections } from "../lib/levelTest/result";
import type { LevelTestProfile } from "../lib/levelTest/profile";
import { useLevelTestSession } from "../stores/pageStateStore";
import type { EstimatedLevel } from "../types/levelTest";

/** 이만큼 지나도 끝나지 않으면 기다리지 않고 코드가 쓴 총평을 보여준다 */
const COMMENT_TIMEOUT_MS = 30_000;

/**
 * 레벨 진단 결과의 "선생님 한마디". 선생님 수업 세션과 **따로 띄운 단발 세션**이다(기억 추출·연습해보기
 * 피드백과 같은 이유 — 총평 지시문이 수업 맥락을 오염시키면 안 된다).
 *
 * - 모델을 **바로 쓸 수 있을 때만**(`available`) 부른다. 내려받아야 하는 상태(`downloadable`)에서 부르면
 *   총평 하나 때문에 모델 다운로드가 시작된다. 그 밖의 상태(지원 안 함·모델 없음)는 코드가 쓴 총평이다.
 * - 출력 가드: 스트리밍 중에 유출로 보이면 그 자리에서 끊고 세션을 버리고 코드 총평으로 바꾼다.
 * - 끝난 총평은 진단마다 세션 스토어에 남긴다 — 결과 화면에 다시 들어와도 모델을 또 부르지 않는다.
 *   다 쓰기 전에 화면을 떠나면 아무것도 남기지 않는다(다음에 다시 쓴다).
 */
function LevelTestComment({
  sections,
  overall,
  profile,
  takenAt,
}: {
  sections: LevelTestSections;
  overall: EstimatedLevel | null;
  profile: LevelTestProfile;
  takenAt: number;
}) {
  const model = useAiModel(LEVEL_COMMENT_SYSTEM_PROMPT);
  const cached = useLevelTestSession((s) => (s.comment?.takenAt === takenAt ? s.comment : null));
  const setComment = useLevelTestSession((s) => s.setComment);
  const [streaming, setStreaming] = useState("");
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  // useAiModel의 반환값은 렌더마다 새 객체라 effect 의존성에 넣지 않고 ref로 최신 값을 읽는다.
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const status = model.status;
  const ready = status === "available";
  const settled = status !== "checking" && !ready;

  useEffect(() => {
    if (cached || startedRef.current) return;
    const fallback = () => ({ takenAt, text: fallbackComment(sections, overall), source: "fallback" as const });
    if (settled) {
      setComment(fallback());
      return;
    }
    if (!ready) return;
    startedRef.current = true;

    void (async () => {
      const current = modelRef.current;
      let acc = "";
      let ok = true;
      const timer = window.setTimeout(() => {
        ok = false;
        current.resetSession();
      }, COMMENT_TIMEOUT_MS);
      try {
        for await (const chunk of current.promptStreaming(buildLevelCommentPrompt(sections, overall, profile))) {
          if (!ok) break;
          acc += chunk;
          // 출력 가드 — 지시문을 옮겨 적기 시작하면 바로 끊는다. 화면에 흐른 조각도 지운다.
          if (looksLikePromptLeak(acc, LEVEL_COMMENT_LEAK_REFERENCE)) {
            ok = false;
            break;
          }
          if (mountedRef.current) setStreaming(acc);
        }
      } catch {
        ok = false;
      } finally {
        window.clearTimeout(timer);
        // 총평은 진단마다 한 번이라 세션에 남길 이유가 없다. 유출이었다면 오염된 턴을 버리는 것이기도 하다.
        current.resetSession();
      }
      if (!mountedRef.current) {
        // 다 쓰기 전에 떠났으면 남기지 않는다 — 다음에 결과 화면에 오면 다시 쓴다.
        startedRef.current = false;
        return;
      }
      const text = acc.trim();
      setComment(ok && text ? { takenAt, text, source: "ai" } : fallback());
      setStreaming("");
    })();
  }, [cached, ready, settled, sections, overall, profile, takenAt, setComment]);

  const text = cached?.text ?? streaming;

  return (
    <section className="rounded-2xl border-2 border-gray-100 bg-white p-4">
      <h3 className="font-bold text-gray-700">🧑‍🏫 선생님 한마디</h3>
      {text ? (
        <p className="mt-2 font-mixed leading-relaxed whitespace-pre-line text-gray-700">{text}</p>
      ) : (
        <div className="mt-2">
          <LoadingMascot label="선생님이 결과를 보는 중" />
        </div>
      )}
    </section>
  );
}

export default LevelTestComment;
