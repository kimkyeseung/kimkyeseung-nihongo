import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { WEAK_REVIEW_PATH } from "../lib/dailyPlan";
import { commandQuery, matchCommands, parseCommand, type TeacherCommand } from "../lib/teacherCommands";
import { unitCheckTargetFromPlan, type UnitCheckTarget } from "../lib/unitCheck";
import { useCurriculumStore } from "../stores/curriculumStore";
import type { CurriculumPlanResult } from "./useCurriculumPlan";

/**
 * 선생님 입력창의 `/` 명령어(teacherCommands.ts)에 딸린 화면 상태 — 명령어 목록, 한 줄 안내,
 * `/today` 카드 — 와 실행을 한데 모은다. 판단(무엇이 명령어인가)은 teacherCommands.ts, 여기는 배선이다.
 *
 * **명령어로 읽힌 입력은 모델에게 보내지 않는다.** `submit()`이 true를 돌려주면 호출부는 묻지 말 것.
 */
export function useTeacherCommands({
  input,
  setInput,
  enabled,
  curriculum,
  onStartTest,
}: {
  input: string;
  setInput: (value: string) => void;
  /** false면 명령어 목록을 띄우지 않는다(지난 날짜를 보는 중 — 입력창이 없다). */
  enabled: boolean;
  /** 지금 진도. 아직 못 읽었으면 null(useCurriculumPlan). */
  curriculum: CurriculumPlanResult | null;
  /** `/test` — 단원 점검 시트를 연다 */
  onStartTest: (target: UnitCheckTarget) => void;
}) {
  const navigate = useNavigate();
  const startLevel = useCurriculumStore((s) => s.startLevel);

  // 목록은 입력창에 포커스가 있을 때만 띄운다. Escape로 닫으면 글자를 더 칠 때까지 닫아 둔다 —
  // 닫은 순간의 입력을 기억해 비교한다(effect로 다시 여는 것보다 단순하다).
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  /**
   * 한 줄 안내. 그때의 입력이 그대로일 때만 보인다 — 고쳐 치기 시작하면 사라진다. `action`이 있으면 안내
   * 옆에 그 화면으로 가는 버튼이 붙는다(진도가 없을 때 레벨 진단으로).
   */
  const [notice, setNotice] = useState<{ text: string; forInput: string; action?: { label: string; to: string } } | null>(
    null
  );
  /** `/today`로 연 "오늘의 학습" 카드. 기록에 남기지 않는다(인사와 같은 앱의 화면이다). */
  const [showToday, setShowToday] = useState(false);

  const commands = enabled ? matchCommands(input) : [];
  const open = focused && commands.length > 0 && dismissedFor !== input;
  const activeIndex = Math.min(index, commands.length - 1);

  /** 입력창을 비우고 실행한다(명령어가 남아 있으면 다음 Enter에 또 돈다). */
  function run(command: TeacherCommand) {
    setInput("");
    setIndex(0);
    setNotice(null);
    switch (command.id) {
      case "test": {
        // 단원 점검 — 점검할 단원이 있어야 한다. 시작 단계가 없으면 진단부터 권한다(예전엔 `/today` 카드를
        // 띄웠지만, 어느 단계인지 모르는 사람에게는 진단이 맞다).
        if (!startLevel) {
          setNotice({
            text: "아직 진도가 없어서 점검할 단원이 없어요. 먼저 레벨 진단을 받아볼까요?",
            forInput: "",
            action: { label: "🎓 레벨 진단 받기", to: "/level" },
          });
          return;
        }
        // 커리큘럼은 동적 import라 한 박자 늦게 온다.
        if (!curriculum) {
          setNotice({ text: "진도를 불러오는 중이에요. 잠시 뒤에 다시 해 주세요.", forInput: "" });
          return;
        }
        const target = unitCheckTargetFromPlan(curriculum.plan);
        if (!target) {
          setNotice({ text: "점검할 단원을 찾지 못했어요.", forInput: "" });
          return;
        }
        onStartTest(target);
        return;
      }
      case "level":
        navigate("/level");
        return;
      case "review":
        navigate(WEAK_REVIEW_PATH);
        return;
      case "today":
        setShowToday(true);
        return;
    }
  }

  /**
   * Enter·보내기 버튼. 명령어면 실행하고, 없는 명령어면 안내만 한다. 둘 다 true — 호출부는 묻지 않는다.
   * 평범한 질문이면 false.
   */
  function submit(): boolean {
    const parsed = parseCommand(input);
    if (!parsed) return false;
    if (parsed.kind === "command") {
      run(parsed.command);
    } else {
      // 모르는 명령어를 질문으로 흘려보내면 선생님이 "/help가 뭔가요?"에 답한다.
      setNotice({
        text: `「${parsed.name}」은(는) 없는 명령어예요. / 만 치면 쓸 수 있는 명령어가 나와요.`,
        forInput: input,
      });
    }
    return true;
  }

  /** 목록이 떠 있으면 화살표·Enter·Escape를 먼저 쓴다. 처리했으면 true. */
  function handleKeyDown(e: KeyboardEvent<HTMLElement>): boolean {
    // 조합(IME) 중인 Enter는 입력기 몫이다.
    if (!open || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setIndex((activeIndex + step + commands.length) % commands.length);
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      run(commands[activeIndex]);
      return true;
    }
    if (e.key === "Escape") {
      setDismissedFor(input);
      return true;
    }
    return false;
  }

  /** 질문을 하면 `/today` 카드와 안내를 걷는다 — 카드는 대화 끝에 붙어서, 두면 새 문답이 그 위로 쌓인다. */
  const clearForQuestion = useCallback(() => {
    setShowToday(false);
    setNotice(null);
  }, []);

  return {
    /** 지금 명령어를 치는 중인가 — 이때는 사전 자동완성을 끈다(`・てst`로 사전을 뒤지지 않게). */
    typing: commandQuery(input) !== null,
    commands,
    open,
    activeIndex,
    run,
    submit,
    handleKeyDown,
    setFocused,
    notice: notice && notice.forInput === input ? notice.text : null,
    noticeAction: notice && notice.forInput === input ? (notice.action ?? null) : null,
    showToday,
    closeToday: () => setShowToday(false),
    clearForQuestion,
  };
}
