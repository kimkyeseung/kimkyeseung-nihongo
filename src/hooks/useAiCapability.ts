import { useEffect, useState } from "react";
import { type AiCapability, resolveAiCapability } from "../lib/aiCapability";

/**
 * 안내 문구를 고르기 위한 최종 판단. `availability()`를 기다려야 하므로 확정 전에는 null이다.
 *
 * **null일 때는 아무것도 단정하지 말 것** — 동기 정보만으로 "내장 AI가 있다"고 먼저 그렸다가
 * 곧바로 뒤집으면, Whale처럼 API 객체만 있는 브라우저에서 잘못된 안내가 한 번 번쩍인다.
 * 중립 상태(로딩/기존 "확인 중" 화면)를 보여주고 확정을 기다릴 것.
 */
export function useAiCapability(): AiCapability | null {
  const [capability, setCapability] = useState<AiCapability | null>(null);

  useEffect(() => {
    let alive = true;
    resolveAiCapability().then((resolved) => {
      if (alive) setCapability(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);

  return capability;
}
