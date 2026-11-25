/** Word-level diff (LCS) for comparing transcript and draft versions. Client/server safe. */
export type DiffPart = { type: "same" | "added" | "removed"; text: string };

export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter((x) => x !== "");
  const B = b.split(/(\s+)/).filter((x) => x !== "");
  // Guard against very large inputs (O(n*m)).
  if (A.length * B.length > 4_000_000) {
    return a === b ? [{ type: "same", text: a }] : [{ type: "removed", text: a }, { type: "added", text: b }];
  }
  const n = A.length, m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("same", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("removed", A[i]); i++; }
    else { push("added", B[j]); j++; }
  }
  while (i < n) push("removed", A[i++]);
  while (j < m) push("added", B[j++]);
  return out;
}

export function fieldText(v: string | string[] | undefined | null): string {
  if (v == null) return "";
  return Array.isArray(v) ? v.join("\n") : v;
}
