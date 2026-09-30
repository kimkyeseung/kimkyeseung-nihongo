import { describe, expect, it } from "vitest";
import { toKana } from "wanakana";
import { commandQuery, matchCommands, parseCommand } from "./teacherCommands";

const ids = (input: string) => matchCommands(input).map((c) => c.id);

describe("commandQuery", () => {
  it("/로 시작하지 않으면 명령어가 아니다", () => {
    expect(commandQuery("test")).toBeNull();
    expect(commandQuery("だけ/しか 차이")).toBeNull();
    expect(commandQuery("")).toBeNull();
  });

  it("/ 하나만 쳐도 명령어를 고르는 중이다", () => {
    expect(commandQuery("/")).toBe("");
  });

  it("공백이 들어가면 평범한 질문이다 — 명령어로 먹으면 질문이 사라진다", () => {
    expect(commandQuery("/ 이건 무슨 뜻이야?")).toBeNull();
    expect(commandQuery("/test 해줘")).toBeNull();
  });

  it("앞뒤 공백은 봐준다", () => {
    expect(commandQuery("  /test ")).toBe("test");
  });
});

describe("matchCommands", () => {
  it("/만 치면 전부 보여준다", () => {
    expect(ids("/")).toEqual(["test", "review", "today"]);
  });

  it("치는 중인 글자로 시작하는 것만", () => {
    expect(ids("/t")).toEqual(["test", "today"]);
    expect(ids("/te")).toEqual(["test"]);
    expect(ids("/x")).toEqual([]);
  });

  it("대문자·전각으로 쳐도 된다", () => {
    expect(ids("/TE")).toEqual(["test"]);
    expect(ids("／ｔｅｓｔ")).toEqual(["test"]);
  });

  it("한글 별칭", () => {
    expect(ids("/테")).toEqual(["test"]);
    expect(ids("/복습")).toEqual(["review"]);
  });

  it("일본어 입력 모드: /는 ・로, test는 てst로 바뀌어 들어온다", () => {
    const typed = toKana("/test", { IMEMode: "toHiragana" });
    expect(typed.startsWith("・")).toBe(true);
    expect(ids(typed)).toEqual(["test"]);
    expect(ids(toKana("/to", { IMEMode: "toHiragana" }))).toEqual(["today"]);
    expect(ids("・")).toEqual(["test", "review", "today"]);
  });

  it("일본어 모드로 치는 도중의 모든 글자에서 목록이 끊기지 않는다", () => {
    // `れゔぃえw`는 로마자로 되돌리면 review가 아니고, `れv`는 가나 이름에 안 걸린다 —
    // 한쪽 비교만 하면 어느 중간에서 목록이 사라진다.
    for (const name of ["test", "review", "today"]) {
      for (let n = 1; n <= name.length; n++) {
        const typed = toKana(`/${name.slice(0, n)}`, { IMEMode: "toHiragana" });
        expect(ids(typed), typed).toContain(name);
      }
    }
  });

  it("평범한 질문에는 아무것도 안 뜬다", () => {
    expect(ids("test가 뭐야")).toEqual([]);
  });
});

describe("parseCommand", () => {
  it("정확히 맞으면 그 명령", () => {
    expect(parseCommand("/test")).toMatchObject({ kind: "command", command: { id: "test" } });
    expect(parseCommand("/오늘")).toMatchObject({ kind: "command", command: { id: "today" } });
    expect(parseCommand(toKana("/review", { IMEMode: "toHiragana" }))).toMatchObject({
      kind: "command",
      command: { id: "review" },
    });
  });

  it("앞부분만 친 건 명령이 아니다(목록에서 고르는 건 따로)", () => {
    expect(parseCommand("/te")).toEqual({ kind: "unknown", name: "/te" });
  });

  it("없는 명령어는 unknown — 모델에게 보내지 않는다", () => {
    expect(parseCommand("/help")).toEqual({ kind: "unknown", name: "/help" });
    expect(parseCommand("/")).toEqual({ kind: "unknown", name: "/" });
  });

  it("평범한 질문은 null — 그대로 선생님에게 간다", () => {
    expect(parseCommand("だけ는 무슨 뜻이야?")).toBeNull();
    expect(parseCommand("/ 이건 무슨 뜻이야?")).toBeNull();
  });
});
