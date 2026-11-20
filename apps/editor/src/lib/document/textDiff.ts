export type DiffPart = { kind: "same" | "add" | "del"; text: string };

/** 超过这个规模（两段长度乘积）就不逐字比，整段当作替换 */
const MAX_CELLS = 400_000;

/** 逐字对比两段文字：del 只在 before 里，add 只在 after 里。中文按字、英文也按字符比，够看清改了哪里。 */
export function diffText(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  const a = before.slice(head, before.length - tail);
  const b = after.slice(head, after.length - tail);
  const middle = (a.length + 1) * (b.length + 1) > MAX_CELLS ? replaceAll(a, b) : lcs(a, b);
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  push("same", before.slice(0, head));
  for (const part of middle) push(part.kind, part.text);
  push("same", before.slice(before.length - tail));
  return parts;
}

function replaceAll(a: string, b: string): DiffPart[] {
  return [
    { kind: "del", text: a },
    { kind: "add", text: b },
  ];
}

function lcs(a: string, b: string): DiffPart[] {
  const cols = b.length + 1;
  const table = new Uint32Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      parts.push({ kind: "del", text: a[i]! });
      i += 1;
    } else {
      parts.push({ kind: "add", text: b[j]! });
      j += 1;
    }
  }
  if (i < a.length) parts.push({ kind: "del", text: a.slice(i) });
  if (j < b.length) parts.push({ kind: "add", text: b.slice(j) });
  return parts;
}
