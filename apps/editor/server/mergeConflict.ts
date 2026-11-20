import type { IncomingMessage, ServerResponse } from "node:http";
import { parseMergeReply } from "../src/lib/document/mergeReply.ts";

export { parseMergeReply };

const PATH = "/wiki/agents/merge";
const MAX_CONFLICTS = 30;
const MAX_TEXT = 4000;

export type MergeConflictInput = {
  id?: string;
  /** 缺这一侧表示该方删掉了这段 */
  base: string | null;
  mine: string | null;
  theirs: string | null;
};

const SYSTEM = [
  "你在合并一篇由多人同时编辑的文章里发生冲突的段落。",
  "每一处给出一个合并后的版本：双方的改动都要保留，双方都没写的内容不要添加，也不要解释。",
  "只输出一个 JSON 数组，第 n 项是第 n 处合并后的纯文本，不要 Markdown 记号，不要代码块包裹。",
].join("");

function sideText(value: unknown): string | null {
  if (value == null) return null;
  return String(value).slice(0, MAX_TEXT);
}

function readConflicts(body: unknown): MergeConflictInput[] | null {
  const rows = body && typeof body === "object" ? (body as { conflicts?: unknown }).conflicts : undefined;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_CONFLICTS) return null;
  return rows.map((row) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      id: typeof item.id === "string" ? item.id.slice(0, 80) : undefined,
      base: sideText(item.base),
      mine: sideText(item.mine),
      theirs: sideText(item.theirs),
    };
  });
}

function promptFor(conflicts: MergeConflictInput[]): string {
  return conflicts
    .map((conflict, index) =>
      [
        `第${index + 1}处`,
        `上一版：${conflict.base ?? "（无）"}`,
        `我的版本：${conflict.mine ?? "（我删除了这段）"}`,
        `对方的版本：${conflict.theirs ?? "（对方删除了这段）"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 512_000) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readModelReply(response: Response): Promise<string> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    const json = (await response.json().catch(() => null)) as { success?: boolean; message?: string; data?: { reply?: string } } | null;
    if (!response.ok || !json?.success) {
      throw new Error(json?.message || "AI_FAILED");
    }
    const reply = String(json.data?.reply ?? "").trim();
    if (!reply) throw new Error("AI_EMPTY");
    return reply;
  }
  const text = await response.text();
  let reply = "";
  for (const block of text.split("\n\n")) {
    const line = block.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const payload = JSON.parse(raw) as { delta?: string; reply?: string };
      reply += payload.delta ?? "";
      if (payload.reply) reply = payload.reply;
    } catch {
      // 忽略无法解析的事件
    }
  }
  if (!reply.trim()) throw new Error("AI_EMPTY");
  return reply;
}

/**
 * POST /wiki/agents/merge
 * 用调用者的登录态调一次模型（sync，不流式给前端），返回每处冲突合并后的文本。
 * 返回 true 表示这个请求已处理。
 */
export async function handleMergeConflict(req: IncomingMessage, res: ServerResponse, gatewayBase: string): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname !== PATH) return false;
  if (req.method !== "POST") {
    send(res, 405, { success: false, message: "METHOD_NOT_ALLOWED" });
    return true;
  }
  const token = String(req.headers.authorization ?? "");
  if (!token.toLowerCase().startsWith("bearer ")) {
    send(res, 401, { success: false, message: "UNAUTHORIZED" });
    return true;
  }

  let conflicts: MergeConflictInput[] | null;
  try {
    conflicts = readConflicts(JSON.parse(await readBody(req)));
  } catch {
    send(res, 400, { success: false, message: "BAD_REQUEST" });
    return true;
  }
  if (!conflicts) {
    send(res, 400, { success: false, message: "BAD_REQUEST" });
    return true;
  }

  const appCode = String(req.headers["x-app-code"] ?? "wiki");
  let response: Response;
  try {
    response = await fetch(new URL("/wiki/agents/chat", `${gatewayBase}/`), {
      method: "POST",
      headers: {
        Authorization: token,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-App-Code": appCode,
      },
      body: JSON.stringify({
        sync: true,
        system: SYSTEM,
        messages: [{ role: "user", content: promptFor(conflicts) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    send(res, 502, { success: false, message: "GATEWAY_UNAVAILABLE" });
    return true;
  }

  try {
    const reply = await readModelReply(response);
    const merges = parseMergeReply(reply, conflicts.length);
    if (merges.every((item) => item == null)) {
      send(res, 502, { success: false, message: "AI_EMPTY" });
      return true;
    }
    send(res, 200, { success: true, data: { merges } });
  } catch (err) {
    send(res, 502, { success: false, message: err instanceof Error ? err.message : "AI_FAILED" });
  }
  return true;
}
