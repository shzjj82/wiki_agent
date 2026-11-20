/** 从模型回复里取出和冲突等长的文本数组，对不上的位置留空 */
export function parseMergeReply(reply: string, count: number): (string | null)[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start < 0 || end <= start) return Array(count).fill(null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return Array(count).fill(null);
  }
  if (!Array.isArray(parsed)) return Array(count).fill(null);
  return Array.from({ length: count }, (_, index) => {
    const value = parsed[index];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  });
}
