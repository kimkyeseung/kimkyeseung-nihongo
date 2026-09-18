import { useMemo } from "react";
import SpeakButton from "./SpeakButton";
import { diffChars } from "../lib/diff";

function WritingDiff({ original, corrected }: { original: string; corrected: string }) {
  const tokens = useMemo(() => diffChars(original, corrected), [original, corrected]);
  const hasDiff = tokens.some((t) => t.type !== "equal");

  if (!hasDiff) {
    return (
      <p className="font-ja text-lg leading-relaxed">
        {corrected}
        <SpeakButton text={corrected} label="문장 발음 듣기" className="mx-1" />
        <span className="text-sm text-primary">(수정할 부분 없음)</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-gray-400">원문</p>
          <SpeakButton text={original} label="원문 발음 듣기" />
        </div>
        <p className="font-ja text-lg leading-relaxed">
          {tokens
            .filter((t) => t.type !== "added")
            .map((t, i) => (
              <span key={i} className={t.type === "removed" ? "bg-danger/10 text-danger line-through" : ""}>
                {t.value}
              </span>
            ))}
        </p>
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-gray-400">수정문</p>
          <SpeakButton text={corrected} label="수정문 발음 듣기" />
        </div>
        <p className="font-ja text-lg leading-relaxed">
          {tokens
            .filter((t) => t.type !== "removed")
            .map((t, i) => (
              <span
                key={i}
                className={t.type === "added" ? "bg-primary/10 text-primary underline decoration-2" : ""}
              >
                {t.value}
              </span>
            ))}
        </p>
      </div>
    </div>
  );
}

export default WritingDiff;
