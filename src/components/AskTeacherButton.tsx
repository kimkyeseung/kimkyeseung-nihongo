import { useNavigate } from "react-router-dom";
import { iconButtonClass, type IconButtonTone } from "./iconButtonClass";
import { buildSentenceExplanationQuestion } from "../lib/teacherPrompts";
import { useTeacherChatStore } from "../stores/teacherChatStore";

/**
 * 문장 옆의 "선생님에게 물어보기" 버튼. 누르면 그 문장의 해석·문법 해설을 묻는 질문을
 * teacherChatStore에 넣어두고 선생님 페이지로 이동한다 — 페이지가 마운트되면서 바로
 * 질문이 날아간다(TeacherPage의 consumePendingQuestion).
 *
 * 이미 선생님 페이지에 있을 때 눌러도 같은 경로로 동작한다(이동은 무시되고 질문만 이어짐).
 */
function AskTeacherButton({
  text,
  label = "선생님에게 물어보기",
  tone = "default",
  className = "",
}: {
  text: string;
  label?: string;
  tone?: IconButtonTone;
  className?: string;
}) {
  const navigate = useNavigate();
  const requestQuestion = useTeacherChatStore((s) => s.requestQuestion);

  if (!text.trim()) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // 문장 자체가 클릭 가능한 화면(ClickableSentence)에서 같이 눌리지 않게
        requestQuestion(buildSentenceExplanationQuestion(text));
        navigate("/teacher");
      }}
      aria-label={label}
      title={label}
      className={iconButtonClass("sm", tone, className)}
    >
      <span aria-hidden="true">🧑‍🏫</span>
    </button>
  );
}

export default AskTeacherButton;
