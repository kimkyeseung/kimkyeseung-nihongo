// 선생님 입력창의 `/` 명령어. `/test`처럼 치면 질문을 모델에게 보내지 않고 앱이 직접 처리한다.
//
// **명령어 판단은 전부 코드가 한다.** "/test라고 치면 테스트를 내 주세요"를 프롬프트에 적어 모델에게
// 맡기면, 입력창이 곧 지시문이 되어 인젝션 통로가 하나 늘어난다(promptSafety.ts). 그래서 명령어로
// 읽힌 입력은 모델에게 한 글자도 가지 않는다.
//
// 조용히 틀리는 종류의 코드다 — 범위를 잘못 잡으면 평범한 질문이 명령어로 먹히거나(질문이 사라진다),
// 명령어가 질문으로 새서 모델이 "/test가 뭔가요?"에 답한다. teacherCommands.test.ts로 고정한다.

import { toKana, toRomaji } from "wanakana";

export type TeacherCommandId = "test" | "level" | "review" | "today";

export interface TeacherCommand {
  id: TeacherCommandId;
  /** 화면에 보여주는 이름(`/` 뒤). */
  name: string;
  /** 같은 명령으로 받아주는 다른 이름 — 한글로 쳐도 된다. */
  aliases: string[];
  emoji: string;
  description: string;
}

export const TEACHER_COMMANDS: TeacherCommand[] = [
  {
    id: "test",
    name: "test",
    aliases: ["테스트", "시험", "점검"],
    emoji: "📝",
    description: "지금 단원 점검하기",
  },
  {
    // `/diagnostics`(Prompt API 자가진단)와 헷갈리지 않게 이름을 일부러 level로 했다.
    id: "level",
    name: "level",
    aliases: ["레벨", "레벨테스트", "진단"],
    emoji: "🎓",
    description: "레벨 진단 받기(10~15분)",
  },
  {
    id: "review",
    name: "review",
    aliases: ["복습"],
    emoji: "🔁",
    description: "틀렸거나 몰랐던 한자·단어 다시 풀기",
  },
  {
    id: "today",
    name: "today",
    aliases: ["오늘"],
    emoji: "📅",
    description: "오늘 공부할 것 보기",
  },
];

/**
 * 명령어의 시작 표시. `・`가 들어 있는 이유: 일본어 입력 모드에서는 로마자 변환이 `/`를
 * **`・`로 바꾼다**(wanakana의 IME 표). 그걸 빼면 일본어 모드에서는 명령어를 칠 방법이 없다.
 * `・`로 시작하는 평범한 질문은 거의 없고, 있어도 아래 규칙(공백 전까지가 명령어 이름)에 걸린다.
 */
const PREFIX = /^[/／・]/;

function normalizeName(name: string): string {
  return name.normalize("NFKC").toLowerCase();
}

/**
 * 치는 중인 이름을 비교할 형태들. 일본어 모드에서는 `test`가 `てst`로, `review`가 `れゔぃえw`로
 * 바뀌어 들어온다. **어느 한쪽으로만 되돌리면 안 맞는다** — `れゔぃえw`를 로마자로 되돌리면
 * `vuie`가 되어 `review`와 다르고, 반대로 명령어 이름을 가나로 바꿔 비교하면 치는 도중의
 * `れv`가 `れゔぃ…`에 안 걸린다. 그래서 원래 글자 그대로, 로마자로 되돌린 것 둘 다 본다.
 */
function queryForms(query: string): string[] {
  return [query, toRomaji(query).toLowerCase()];
}

/** 명령어 이름·별칭과, 그걸 일본어 모드로 쳤을 때 들어오는 글자. */
function nameForms(command: TeacherCommand): string[] {
  const plain = [command.name, ...command.aliases].map(normalizeName);
  return [...plain, ...plain.map((n) => toKana(n, { IMEMode: "toHiragana" }))];
}

/**
 * 입력이 명령어를 치는 중이면 `/` 뒤의 이름 부분을, 아니면 null을 준다.
 * **공백이 나오면 명령어가 아니다** — `/test` 뒤에 무엇을 붙이는 명령은 아직 없고, 공백 뒤까지
 * 명령어로 먹으면 `/ 이건 무슨 뜻이야?` 같은 질문이 통째로 사라진다.
 */
export function commandQuery(input: string): string | null {
  const text = input.trimStart();
  if (!PREFIX.test(text)) return null;
  const rest = text.slice(1);
  if (/\s/.test(rest.trimEnd())) return null;
  return normalizeName(rest.trim());
}

/**
 * 이름을 앞에서부터 한 글자씩 늘려 일본어 모드로 쳤을 때 들어오는 글자들(`l`, `ぇ`, `ぇv`, `ぇゔぇ`, …).
 * **위 두 비교만으로는 모자란다 (level을 더하다 실제로 걸렸다).** `/lev`는 `・ぇv`로 들어오는데, 로마자로
 * 되돌리면 `ev`라 level이 아니고 완성된 가나 `ぇゔぇl`과도 앞부분이 다르다(`ゔ` ≠ `v`). 치는 도중의 모양을
 * 그대로 만들어 두고 같은지 본다.
 */
function typingForms(command: TeacherCommand): string[] {
  const out: string[] = [];
  for (const name of [command.name, ...command.aliases].map(normalizeName)) {
    for (let n = 1; n <= name.length; n++) out.push(toKana(name.slice(0, n), { IMEMode: "toHiragana" }));
  }
  return out;
}

/** 명령어 목록(입력창 위에 뜨는 것). 이름이나 별칭이 치는 중인 글자로 시작하는 것만. */
export function matchCommands(input: string): TeacherCommand[] {
  const query = commandQuery(input);
  if (query === null) return [];
  const forms = queryForms(query);
  return TEACHER_COMMANDS.filter(
    (command) =>
      nameForms(command).some((n) => forms.some((q) => n.startsWith(q))) || typingForms(command).includes(query)
  );
}

export type ParsedCommand =
  | { kind: "command"; command: TeacherCommand }
  /** `/`로 시작했지만 없는 명령어. 모델에게 보내지 않고 안내만 한다. */
  | { kind: "unknown"; name: string };

/**
 * Enter를 눌렀을 때: 명령어면 그 명령을, `/`로 시작했는데 없는 이름이면 unknown을, 평범한
 * 질문이면 null을 준다(그대로 선생님에게 묻는다).
 */
export function parseCommand(input: string): ParsedCommand | null {
  const query = commandQuery(input);
  if (query === null) return null;
  const forms = queryForms(query);
  const command = TEACHER_COMMANDS.find((c) => nameForms(c).some((n) => forms.includes(n)));
  return command ? { kind: "command", command } : { kind: "unknown", name: input.trim() };
}
