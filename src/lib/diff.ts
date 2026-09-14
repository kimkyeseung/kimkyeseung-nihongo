export interface DiffToken {
  type: "equal" | "removed" | "added";
  value: string;
}

/** 두 문자열을 문자 단위 LCS로 비교한다. 일본어는 띄어쓰기가 없어 단어 단위 대신 문자 단위로 비교한다. */
export function diffChars(a: string, b: string): DiffToken[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  const push = (type: DiffToken["type"], ch: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.value += ch;
    else tokens.push({ type, value: ch });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("removed", a[i]);
      i++;
    } else {
      push("added", b[j]);
      j++;
    }
  }
  while (i < n) push("removed", a[i++]);
  while (j < m) push("added", b[j++]);

  return tokens;
}
