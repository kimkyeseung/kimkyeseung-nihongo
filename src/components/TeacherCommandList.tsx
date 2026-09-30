import { AnimatePresence, motion } from "framer-motion";
import type { TeacherCommand } from "../lib/teacherCommands";

/**
 * 선생님 입력창에 `/`를 치면 위로 뜨는 명령어 목록. 모양과 위치는 사전 자동완성
 * (`JapaneseSuggestionList`의 `placement="above"`)과 같다 — 이 입력창은 화면 맨 아래에 붙어 있다.
 */
function TeacherCommandList({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: TeacherCommand[];
  activeIndex: number;
  onSelect: (command: TeacherCommand) => void;
}) {
  return (
    <AnimatePresence>
      {commands.length > 0 && (
        <motion.ul
          role="listbox"
          aria-label="명령어"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-full z-10 mb-2 w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
        >
          {commands.map((command, i) => (
            <li key={command.id} role="option" aria-selected={i === activeIndex}>
              <button
                // 누르는 순간 입력창이 blur되면 목록이 먼저 사라져 클릭이 죽는다.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(command)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                  i === activeIndex ? "bg-primary/10" : ""
                }`}
              >
                <span className="shrink-0 text-lg leading-none">{command.emoji}</span>
                <span className="shrink-0 whitespace-nowrap text-gray-800">/{command.name}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-500">{command.description}</span>
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}

export default TeacherCommandList;
