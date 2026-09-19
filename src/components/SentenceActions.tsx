import { useNavigate } from "react-router-dom";
import ActionMenu, { type ActionMenuItem } from "./ActionMenu";
import type { IconButtonSize, IconButtonTone } from "./iconButtonClass";
import { useJapaneseSpeech } from "../hooks/useJapaneseSpeech";
import { copyToClipboard } from "../lib/clipboard";
import { toSpeechText } from "../lib/speechText";
import { buildSentenceExplanationQuestion } from "../lib/teacherPrompts";
import { XP_REWARDS } from "../lib/xpRewards";
import { useGamificationStore } from "../stores/gamificationStore";
import { sentenceKey, useSentencebookStore } from "../stores/sentencebookStore";
import { useTeacherChatStore } from "../stores/teacherChatStore";

/**
 * 일본어 문장 옆에 붙는 **⋮ 동작 메뉴**(발음·복사·선생님에게 묻기).
 *
 * 왜 한 컴포넌트인가: 예전에는 세 자리(회화 말풍선·선생님 답변의 예문 칩·단어 상세의 생성
 * 예문)가 같은 버튼 세 줄을 각자 복붙하고 있었는데, **단어 상세만 발음 버튼 하나로 남아 있는
 * 걸 한참 뒤에야 사용자가 알려줘서 발견했다**(버튼이 없는 건 콘솔에 안 찍힌다). 여기 하나만
 * 고치면 세 자리에 동시에 반영된다.
 *
 * 왜 버튼을 늘어놓지 않고 메뉴인가: 항목이 늘어나면 문장 뒤에 동그라미가 줄줄이 붙어 정작
 * 문장을 밀어낸다. 375px에서는 예문 한 줄이 두 줄로 접히기 시작한다.
 *
 * **항목을 추가할 때는 `extraItems`로 넘기거나 여기 배열에 한 줄을 더한다** — 부르는 쪽에서
 * 버튼을 따로 붙이지 말 것. 그렇게 하면 다시 자리마다 달라진다.
 */
function SentenceActions({
  text,
  /**
   * 라벨에 들어갈 이름("예문", "상대 문장"...). 스크린리더가 메뉴를 구분하는 유일한 단서라,
   * 한 화면에 문장이 여러 종류면 서로 다르게 줄 것.
   */
  subject = "문장",
  /** 이 문장에만 붙는 항목(뒤에 이어 붙는다). */
  extraItems = [],
  size = "sm",
  tone = "default",
  className = "ml-1",
}: {
  text: string;
  subject?: string;
  extraItems?: ActionMenuItem[];
  size?: IconButtonSize;
  tone?: IconButtonTone;
  className?: string;
}) {
  const navigate = useNavigate();
  const requestQuestion = useTeacherChatStore((s) => s.requestQuestion);
  const { speak, isSupported } = useJapaneseSpeech();

  // 담긴 문장인지에 따라 "담기 ↔ 빼기"로 바뀌는 항목이라, 스토어를 구독해 다시 그린다.
  const key = sentenceKey(text);
  const saved = useSentencebookStore((s) => Boolean(s.entries[key]));
  const addSentence = useSentencebookStore((s) => s.addSentence);
  const removeSentence = useSentencebookStore((s) => s.removeSentence);
  const recordProgress = useGamificationStore((s) => s.recordProgress);

  // 화면 문자열에는 "일본어 (한국어 번역)"처럼 한글이 섞인 항목이 있어서, 읽히기 전에
  // 일본어만 남긴다(speechText.ts). 남는 게 없으면 발음 항목 자체를 빼버린다.
  const speechText = toSpeechText(text);

  const items: ActionMenuItem[] = [
    // SpeechSynthesis 미지원 브라우저에서는 항목을 아예 숨긴다 — 눌러도 아무 일 없는
    // 메뉴 줄을 남기느니 없는 편이 낫다(SpeakButton이 스스로 사라지던 것과 같은 방침).
    ...(isSupported && speechText
      ? [
          {
            id: "speak",
            icon: "🗣️",
            label: "발음 듣기",
            onSelect: () => speak(speechText),
          },
        ]
      : []),
    {
      id: "wordbook",
      icon: "🗂️",
      label: saved ? "단어장에서 빼기" : "단어장에 문장 담기",
      // 담을 때만 알려준다 — 빼는 건 메뉴 글자가 바뀌는 것으로 이미 드러난다.
      doneLabel: saved ? undefined : "단어장에 담았어요",
      onSelect: () => {
        if (saved) {
          removeSentence(key);
          return;
        }
        // 게이미피케이션 규칙: "아직 안 담긴 → 담긴"으로 바뀔 때만 XP를 준다.
        // 담았다 뺐다를 반복해도 중복 지급되지 않는다.
        if (addSentence(text, subject)) recordProgress(XP_REWARDS.sentenceAdded);
      },
    },
    {
      id: "copy",
      icon: "📋",
      label: "복사하기",
      doneLabel: "복사했어요",
      // 실패하면 false가 돌아가 "복사했어요"를 건너뛴다 — 안 된 걸 됐다고 하면 안 된다.
      onSelect: () => copyToClipboard(text),
    },
    {
      id: "teacher",
      icon: "🧑‍🏫",
      label: "선생님에게 묻기",
      onSelect: () => {
        requestQuestion(buildSentenceExplanationQuestion(text));
        navigate("/teacher");
      },
    },
    ...extraItems,
  ];

  if (!text.trim()) return null;

  return (
    <ActionMenu
      items={items}
      label={`${subject} 메뉴 열기`}
      size={size}
      tone={tone}
      className={className}
    />
  );
}

export default SentenceActions;
