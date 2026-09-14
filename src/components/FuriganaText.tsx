import { Fragment, useMemo } from "react";
import { annotateFurigana } from "../lib/furigana";

function FuriganaText({ text, show }: { text: string; show: boolean }) {
  const segments = useMemo(() => (show ? annotateFurigana(text) : null), [text, show]);

  if (!segments) return <>{text}</>;

  return (
    <>
      {segments.map((seg, i) =>
        seg.parts ? (
          <ruby key={i}>
            {seg.parts.map((p, j) => (
              <Fragment key={j}>
                {p.ruby}
                <rt>{p.rt}</rt>
              </Fragment>
            ))}
          </ruby>
        ) : (
          <Fragment key={i}>{seg.plain}</Fragment>
        )
      )}
    </>
  );
}

export default FuriganaText;
