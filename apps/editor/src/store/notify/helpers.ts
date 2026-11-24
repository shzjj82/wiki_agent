import { emptyEditorDocument, normalizeEditorDocument, type EditorJsDocument } from "@myblog/shared";
import { documentText } from "@/lib/document/search";
import type { NotifyNotice, NotifyTodo, TodoAttachment, TodoRecordStatus, WikiTodoPage } from "./types";

const TODO_PAGE_KEY = "editor:todo-pages";

export function isTodoListRecord(todo: NotifyTodo | null | undefined): boolean {
  if (!todo) return false;
  return todo.category === "list" || todo.data?.kind === "list";
}

export function taskListId(todo: NotifyTodo | null | undefined): string {
  const raw = todo?.data?.listId;
  return typeof raw === "string" ? raw.trim() : "";
}

/** 铃铛待办：未开始和进行中。不含列表记录，也不把 open 当成一种状态 */
export function isActiveTodoStatus(status: string | undefined | null): boolean {
  return status === "pending" || status === "in_progress";
}

/** 写出四态。旧值 open 不再提交，落到 pending */
export function toWireTodoStatus(status: string | undefined | null): TodoRecordStatus {
  if (status === "in_progress" || status === "done" || status === "cancelled" || status === "pending") {
    return status;
  }
  return "pending";
}

export function normalizeTodoStatus(status: string | undefined | null): TodoRecordStatus {
  if (status === "in_progress" || status === "done" || status === "cancelled" || status === "pending") {
    return status;
  }
  return "pending";
}

/** 只看 status。开始时间和 data.localStatus 不参与判断 */
export function fineTodoStatus(todo: Pick<NotifyTodo, "status" | "startedAt" | "data">): TodoRecordStatus {
  return normalizeTodoStatus(todo.status);
}

export function todoAttachments(todo: NotifyTodo | null | undefined): TodoAttachment[] {
  const raw = todo?.data?.attachments;
  if (!Array.isArray(raw)) return [];
  const out: TodoAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const fileId = typeof row.fileId === "string" ? row.fileId.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!fileId || !name) continue;
    out.push({
      fileId,
      name,
      size: typeof row.size === "number" ? row.size : 0,
      mime: typeof row.mime === "string" ? row.mime : "",
      source: row.source === "remote" ? "remote" : "local",
      ...(typeof row.url === "string" && row.url ? { url: row.url } : {}),
    });
  }
  return out;
}

const EMBED_BLOCK_DENY = new Set(["todo", "pageLink", "aiAssist"]);

/** 详情正文：旧纯文本或 Editor.js JSON；并去掉嵌入态不允许的块 */
export function contentDocumentFromTodo(todo: Pick<NotifyTodo, "content"> | null | undefined): EditorJsDocument {
  const raw = (todo?.content ?? "").trim();
  if (!raw) {
    return emptyEditorDocument();
  }
  const doc = normalizeEditorDocument(raw);
  return {
    ...doc,
    blocks: (doc.blocks ?? []).filter((block) => !EMBED_BLOCK_DENY.has(block.type)),
  };
}

export function encodeTodoContent(doc: EditorJsDocument): string {
  const blocks = (doc.blocks ?? []).filter((block) => !EMBED_BLOCK_DENY.has(block.type));
  if (!blocks.length) {
    return "";
  }
  return JSON.stringify({
    time: doc.time ?? Date.now(),
    version: doc.version ?? "2.30.7",
    blocks,
  });
}

/** 铃铛列表摘要：块文档抽纯文本；旧 content 当纯文本 */
export function todoContentPreview(todo: Pick<NotifyTodo, "title" | "content">): string {
  const title = todo.title.trim();
  const raw = (todo.content ?? "").trim();
  if (!raw) return "";
  const text = documentText(normalizeEditorDocument(raw)).replace(/\s+/g, " ").trim();
  if (!text || text === title) return "";
  return text;
}

/** 把远程待办转成 wiki 页初始正文：标题 + 任务说明，方便继续填写 */
export function documentFromTodo(todo: NotifyTodo): EditorJsDocument {
  const title = todo.title.trim();
  const body = contentDocumentFromTodo(todo);
  const blocks: EditorJsDocument["blocks"] = [
    {
      type: "header",
      data: { text: title, level: 1 },
    },
  ];
  if (body.blocks.length) {
    blocks.push(...body.blocks);
  } else {
    blocks.push({ type: "paragraph", data: { text: "" } });
  }
  return {
    time: Date.now(),
    version: "2.30.7",
    blocks,
  };
}

export function readTodoPageMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TODO_PAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [todoId, pageId] of Object.entries(parsed)) {
      if (typeof pageId === "string" && pageId) out[todoId] = pageId;
    }
    return out;
  } catch {
    return {};
  }
}

export function rememberTodoPage(todoId: string, pageId: string): void {
  const next = { ...readTodoPageMap(), [todoId]: pageId };
  localStorage.setItem(TODO_PAGE_KEY, JSON.stringify(next));
}

function asPage(value: unknown): WikiTodoPage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;
  return { id };
}

/** 通知或待办 data 里的文档 id：先 page.id，再 pageId */
export function pageIdFromRecord(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const page = asPage(row.page);
  if (page) return page.id;
  const pageId = typeof row.pageId === "string" ? row.pageId.trim() : "";
  return pageId || null;
}

/** 跳转文档：顶层 page，其次 data.page / data.pageId，最后才是本机记住的旧映射 */
export function pageIdFromTodo(todo: NotifyTodo): string | null {
  const linked = todo.page?.id?.trim() || pageIdFromRecord(todo.data);
  if (linked) return linked;
  return readTodoPageMap()[todo.id] ?? null;
}

export function pageIdFromNotice(notice: NotifyNotice): string | null {
  return pageIdFromRecord(notice.data);
}

export function noticeKind(notice: NotifyNotice): string {
  const kind = notice.data?.kind;
  return typeof kind === "string" ? kind : "";
}

/** 服务端还没绑上文档，打开前要先 POST /wiki/todos/:id/page */
export function todoNeedsPageBind(todo: NotifyTodo): boolean {
  if (todo.data?.legacyWithoutPage) return true;
  return !todo.page?.id?.trim() && !pageIdFromRecord(todo.data);
}
