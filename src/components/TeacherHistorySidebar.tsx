import { AnimatePresence, motion } from "framer-motion";
import { formatDayLabel, localDateKey } from "../lib/localDate";
import { useTeacherChatStore } from "../stores/teacherChatStore";

interface Props {
  /** 좁은 화면에서 서랍이 열려 있는지. 넓은 화면에서는 무시된다(항상 보인다). */
  open: boolean;
  onClose: () => void;
}

function DayList({ onPick }: { onPick: () => void }) {
  const dates = useTeacherChatStore((s) => s.dates);
  const activeDate = useTeacherChatStore((s) => s.activeDate);
  const messagesByDate = useTeacherChatStore((s) => s.messagesByDate);
  const openDate = useTeacherChatStore((s) => s.openDate);
  const deleteDate = useTeacherChatStore((s) => s.deleteDate);
  const today = localDateKey();

  return (
    <ul className="flex flex-col gap-1">
      {dates.map((date) => {
        const isActive = date === activeDate;
        const isToday = date === today;
        const count = messagesByDate[date]?.filter((m) => m.role === "user").length;
        return (
          <li key={date} className="group relative">
            <button
              onClick={() => {
                void openDate(date);
                onPick();
              }}
              className={`w-full rounded-2xl px-3 py-2 pr-8 text-left ${
                isActive ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block truncate text-sm">
                {isToday && <span aria-hidden>✏️ </span>}
                {formatDayLabel(date, today)}
              </span>
              {/* 아직 안 읽어온 날짜는 개수를 모른다 — 0으로 단정하지 않고 비워둔다. */}
              {count !== undefined && (
                <span className="block text-xs text-gray-400">
                  {count === 0 ? "아직 질문 없음" : `질문 ${count}개`}
                </span>
              )}
            </button>
            {/* 오늘은 여기서 지우지 않는다 — 헤더의 "대화 지우기"가 하는 일이고, 사이드바에서
                오늘을 지워 목록에서 빼버리면 돌아올 자리가 사라진다. */}
            {!isToday && (
              <button
                onClick={() => void deleteDate(date)}
                aria-label={`${formatDayLabel(date, today)} 기록 지우기`}
                className="absolute top-2 right-2 px-1 text-lg leading-none text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 선생님 대화 기록 사이드바. 날짜 하나가 대화 한 묶음이다(일기와 같은 단위 — 세션을 따로
 * 나누지 않는다).
 *
 * 넓은 화면에서는 왼쪽에 상주하고, 좁은 화면에서는 서랍으로 연다. 375px에서 사이드바를
 * 붙박이로 두면 대화 영역이 200px대까지 좁아져서 예문 한 줄이 서너 줄로 접힌다.
 */
function TeacherHistorySidebar({ open, onClose }: Props) {
  return (
    <>
      {/* 넓은 화면: 붙박이 */}
      <aside className="hidden w-52 shrink-0 overflow-y-auto border-r border-gray-100 p-2 sm:block">
        <p className="px-3 pt-1 pb-2 text-xs text-gray-400">대화 기록</p>
        <DayList onPick={() => {}} />
      </aside>

      {/* 좁은 화면: 서랍 */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-30 flex sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <div className="absolute inset-0 bg-black/30" />
            <motion.aside
              className="relative flex h-full w-64 max-w-[80%] flex-col overflow-y-auto bg-white p-2"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 pt-1 pb-2">
                <p className="text-xs text-gray-400">대화 기록</p>
                <button onClick={onClose} aria-label="닫기" className="text-xl leading-none text-gray-400">
                  ×
                </button>
              </div>
              <DayList onPick={onClose} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default TeacherHistorySidebar;
