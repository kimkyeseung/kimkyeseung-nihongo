import { useEffect, useRef, useState } from "react";
import {
  BACKUP_LOCAL_KEYS,
  backupFileName,
  buildBackup,
  dateKeyOf,
  parseBackup,
  type BackupFile,
  type BackupSummary,
} from "../lib/backup";
import { exportAllMemory, replaceAllMemory } from "../lib/learnerMemoryDb";

/** 마지막으로 내보낸 시각. 백업 파일에는 담지 않는다(이 기기의 사정이다). */
const LAST_BACKUP_KEY = "last-backup-at";

function readLastBackup(): number | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function daysAgoLabel(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

type Pending = { backup: BackupFile; summary: BackupSummary };

/**
 * 학습 데이터 백업/복원 카드(/about).
 *
 * **복원은 합치기가 아니라 되돌리기다.** 백업에 없는 단어장 설정은 기본값으로 돌아가고, 기록·
 * 대화는 백업 내용으로 갈아끼운다. 합치면 스트릭·XP처럼 "하나의 값"인 것을 어떻게 합칠지
 * 정할 방법이 없다. 대신 되돌리기 전에 무엇이 들어 있는 백업인지 숫자로 보여주고 한 번 더 묻는다.
 *
 * 순서가 중요하다: **IndexedDB를 먼저 바꾸고, 성공했을 때만 localStorage를 쓴다.** 거꾸로 하면
 * 기록 쪽이 실패했을 때 단어장만 옛날로 돌아간 반쪽짜리 상태가 남는다. 다 쓴 뒤에는 새로고침한다
 * — 각 스토어가 메모리에 들고 있는 값을 일일이 다시 읽히는 것보다 확실하고, 새로고침 전에
 * 스토어가 옛 값으로 localStorage를 다시 덮을 틈도 없다.
 */
function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  // "며칠 전"의 기준 시각. 렌더마다 Date.now()를 부르면 순수하지 않으므로 마운트 때 한 번 잡고,
  // 내보낼 때 같이 갱신한다(단어장 복습의 `now`와 같은 방식).
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  // 확인 상자는 버튼 아래에 열려서 375px에서는 화면 밖에 뜬다 — 파일을 고르고 돌아왔는데
  // 아무 일도 없는 것처럼 보이지 않게 끌어올린다.
  useEffect(() => {
    if (pending) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [pending]);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const memory = await exportAllMemory();
      const now = new Date();
      const backup = buildBackup((key) => localStorage.getItem(key), memory, now);
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName(now);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 바로 revoke하면 일부 브라우저(Safari)가 다운로드를 시작하기 전에 URL이 사라진다.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      try {
        localStorage.setItem(LAST_BACKUP_KEY, String(now.getTime()));
      } catch {
        // 기록 못 해도 백업 파일은 이미 받았다.
      }
      setLastBackup(now.getTime());
      setNow(now.getTime());
      setMessage(
        memory
          ? { tone: "ok", text: "백업 파일을 내려받았어요. 안전한 곳(클라우드 드라이브 등)에 옮겨 두세요." }
          : {
              tone: "error",
              text: "단어장·진도는 담았지만, 이 브라우저에서 학습 기록·선생님 대화를 읽을 수 없어 빠졌어요.",
            }
      );
    } catch {
      setMessage({ tone: "error", text: "백업 파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setMessage(null);
    setPending(null);
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setPending({ backup: result.backup, summary: result.summary });
  }

  async function handleRestore() {
    if (!pending) return;
    setBusy(true);
    const { backup } = pending;
    // 기록을 못 읽은 채 만든 백업(memory: null)이면 지금 있는 기록은 건드리지 않는다.
    if (backup.memory) {
      const ok = await replaceAllMemory(backup.memory);
      if (!ok) {
        setBusy(false);
        setMessage({
          tone: "error",
          text: "학습 기록을 되돌리지 못해서 아무것도 바꾸지 않았어요. 사생활 보호 모드라면 일반 창에서 다시 시도해 주세요.",
        });
        return;
      }
    }
    try {
      for (const key of BACKUP_LOCAL_KEYS) {
        const value = backup.local[key];
        if (value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    } catch {
      setBusy(false);
      setMessage({ tone: "error", text: "단어장·진도를 저장하지 못했어요. 저장 공간을 확인해 주세요." });
      return;
    }
    window.location.reload();
  }

  const exportedDate = pending?.backup.exportedAt ? new Date(pending.backup.exportedAt) : null;

  return (
    <div className="mt-2 rounded-2xl border-2 border-gray-100 bg-white p-4">
      <p className="text-sm text-gray-600">
        단어장·진도·학습 기록·선생님 대화는 <b>이 브라우저에만</b> 저장돼요. 브라우저 데이터를
        지우거나 기기를 바꾸면 사라지니, 가끔 파일로 내려받아 두세요.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        마지막 백업:{" "}
        {lastBackup
          ? `${dateKeyOf(new Date(lastBackup))} (${daysAgoLabel(lastBackup, now)})`
          : "아직 없어요"}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className="btn-press flex-1 rounded-2xl bg-primary py-2.5 text-sm text-white disabled:opacity-50"
          style={{ ["--btn-shadow" as string]: "#3d9401" }}
        >
          ⬇️ 백업 내려받기
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-press flex-1 rounded-2xl bg-gray-100 py-2.5 text-sm text-gray-600 disabled:opacity-50"
        >
          ⬆️ 백업에서 되돌리기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 같은 파일을 다시 골라도 change가 오도록 비운다.
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>

      {pending && (
        <div ref={confirmRef} className="mt-3 rounded-2xl bg-warning/10 p-3 text-sm text-gray-700">
          <p className="font-bold">
            {exportedDate ? `${dateKeyOf(exportedDate)}에 만든 백업` : "이 백업"}으로 되돌릴까요?
          </p>
          <ul className="mt-1 text-xs text-gray-600">
            <li>
              단어 {pending.summary.words}개 · 문장 {pending.summary.sentences}개 · 익힌 한자{" "}
              {pending.summary.kanjiLearned}자
            </li>
            <li>
              ⭐ {pending.summary.xp} XP · 🔥 {pending.summary.streak}일
            </li>
            {pending.backup.memory ? (
              <li>
                학습 기록 {pending.summary.events}개 · 기억 {pending.summary.facts}개 · 선생님 대화{" "}
                {pending.summary.chatDays}일치
              </li>
            ) : (
              <li>학습 기록·대화는 이 백업에 없어서 지금 것을 그대로 둬요.</li>
            )}
            {pending.summary.skipped > 0 && (
              <li className="text-danger">망가진 항목 {pending.summary.skipped}개는 건너뛰어요.</li>
            )}
          </ul>
          <p className="mt-2 text-xs text-danger">
            지금 이 기기에 있는 내용은 백업 내용으로 바뀌어요. 필요하면 먼저 지금 것을 내려받아 두세요.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setPending(null)}
              disabled={busy}
              className="flex-1 rounded-2xl bg-white py-2 text-sm text-gray-500"
            >
              취소
            </button>
            <button
              onClick={() => void handleRestore()}
              disabled={busy}
              className="btn-press flex-1 rounded-2xl bg-danger py-2 text-sm text-white disabled:opacity-50"
              style={{ ["--btn-shadow" as string]: "#c93636" }}
            >
              되돌리기
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-3 text-xs ${message.tone === "ok" ? "text-primary" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export default BackupCard;
