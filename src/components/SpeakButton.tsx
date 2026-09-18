import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { toSpeechText } from "../lib/speechText";
import { iconButtonClass, type IconButtonSize, type IconButtonTone } from "./iconButtonClass";

/**
 * 일본어 문장/단어 끝에 붙이는 발음 재생 버튼. 문장을 보여주는 화면에서 발음을 들려주고
 * 싶으면 이 컴포넌트를 재사용할 것 — useJapaneseSpeech를 화면마다 새로 부르지 말 것.
 * SpeechSynthesis 미지원 브라우저에서는 아무것도 렌더링하지 않는다(안내는 GojuonPage처럼
 * 페이지 단위로 한 번만 보여주는 쪽이 덜 시끄럽다).
 */
function SpeakButton({
  text,
  label = "발음 듣기",
  size = "sm",
  tone = "default",
  className = "",
}: {
  text: string;
  /** 스크린리더용 설명. 같은 화면에 버튼이 여러 개면 무엇을 읽는지 구분해서 넘길 것. */
  label?: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  className?: string;
}) {
  const { speak, isSupported } = useJapaneseSpeech();
  const speechText = toSpeechText(text);

  if (!isSupported || !speechText) return null;

  return (
    <button
      type="button"
      // 문장 자체가 클릭 가능한 화면(ClickableSentence)이 있어서, 버블/카드의 클릭이
      // 같이 발동하지 않도록 전파를 막는다.
      onClick={(e) => {
        e.stopPropagation();
        speak(speechText);
      }}
      aria-label={label}
      title={label}
      className={iconButtonClass(size, tone, className)}
    >
      {/* 🔊는 애플 이모지에서 회색이라 작게 쓰면 잘 안 보인다 — 컬러가 들어간 🗣️를 쓴다.
          VS16(️)을 붙여야 흑백 텍스트 글리프가 아니라 컬러 이모지로 확실히 렌더된다. */}
      <span aria-hidden="true">🗣️</span>
    </button>
  );
}

export default SpeakButton;
